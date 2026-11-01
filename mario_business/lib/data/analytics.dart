import '../core/date_range.dart';
import '../models/sales.dart';

class Slice {
  final String key;
  final double value;
  final int count;
  const Slice(this.key, this.value, this.count);
}

class TrendPoint {
  final DateTime day;
  final double revenue;
  final double expenses;
  final int bills;
  const TrendPoint(this.day, this.revenue, this.expenses, this.bills);

  double get profit => revenue - expenses;
}

class ItemAgg {
  final String id;
  final String name;
  final String category;
  int qty = 0;
  double revenue = 0;
  ItemAgg(this.id, this.name, this.category);
}

/// Derived analytics computed on the device from the bills and expenses of
/// a revenue report. Cancelled bills are excluded everywhere.
class SalesAnalytics {
  final List<Bill> bills;
  final List<Expense> expenses;
  final DateRange range;

  SalesAnalytics(List<Bill> allBills, this.expenses, this.range)
      : bills = allBills.where((b) => !b.isCancelled).toList()
          ..sort((a, b) => b.generatedAt.compareTo(a.generatedAt));

  double get revenue => bills.fold(0.0, (s, b) => s + b.total);
  double get tax => bills.fold(0.0, (s, b) => s + b.taxTotal);
  double get discount => bills.fold(0.0, (s, b) => s + b.discount);
  double get expenseTotal => expenses.fold(0.0, (s, e) => s + e.amount);
  int get itemsSold => bills.fold(0, (s, b) => s + b.itemCount);
  double get avgBill => bills.isEmpty ? 0 : revenue / bills.length;
  double get avgItemsPerBill => bills.isEmpty ? 0 : itemsSold / bills.length;
  Bill? get largestBill => bills.isEmpty ? null : bills.reduce((a, b) => a.total >= b.total ? a : b);

  /// One point per day in the range (days with no sales are zero).
  List<TrendPoint> dailyTrend() {
    final rev = <DateTime, double>{};
    final cnt = <DateTime, int>{};
    final exp = <DateTime, double>{};
    DateTime d(DateTime t) => DateTime(t.year, t.month, t.day);
    for (final b in bills) {
      final k = d(b.generatedAt);
      rev[k] = (rev[k] ?? 0) + b.total;
      cnt[k] = (cnt[k] ?? 0) + 1;
    }
    for (final e in expenses) {
      final k = d(e.date);
      exp[k] = (exp[k] ?? 0) + e.amount;
    }
    return range.allDays.map((day) => TrendPoint(day, rev[day] ?? 0, exp[day] ?? 0, cnt[day] ?? 0)).toList();
  }

  /// Revenue and bill count per hour of day (0–23).
  List<Slice> hourly() {
    final rev = List<double>.filled(24, 0);
    final cnt = List<int>.filled(24, 0);
    for (final b in bills) {
      rev[b.generatedAt.hour] += b.total;
      cnt[b.generatedAt.hour]++;
    }
    return List.generate(24, (h) => Slice('$h', rev[h], cnt[h]));
  }

  /// Revenue per weekday (1 = Monday … 7 = Sunday).
  List<Slice> weekdays() {
    final rev = List<double>.filled(7, 0);
    final cnt = List<int>.filled(7, 0);
    for (final b in bills) {
      rev[b.generatedAt.weekday - 1] += b.total;
      cnt[b.generatedAt.weekday - 1]++;
    }
    return List.generate(7, (i) => Slice('${i + 1}', rev[i], cnt[i]));
  }

  /// 7 × 24 revenue grid: [weekday-1][hour].
  List<List<double>> heatmap() {
    final grid = List.generate(7, (_) => List<double>.filled(24, 0));
    for (final b in bills) {
      grid[b.generatedAt.weekday - 1][b.generatedAt.hour] += b.total;
    }
    return grid;
  }

  List<Slice> _groupBy(String Function(Bill) key) {
    final rev = <String, double>{};
    final cnt = <String, int>{};
    for (final b in bills) {
      final k = key(b);
      rev[k] = (rev[k] ?? 0) + b.total;
      cnt[k] = (cnt[k] ?? 0) + 1;
    }
    return rev.entries.map((e) => Slice(e.key, e.value, cnt[e.key]!)).toList()
      ..sort((a, b) => b.value.compareTo(a.value));
  }

  List<Slice> paymentMethods() => _groupBy((b) => b.paymentMethod.isEmpty ? 'other' : b.paymentMethod.toLowerCase());

  List<Slice> channels() => _groupBy((b) => b.channel);

  List<Slice> staff() => _groupBy((b) => b.generatedBy.isEmpty ? 'unknown' : b.generatedBy);

  List<Slice> tables() => _groupBy((b) => b.tableLabel);

  /// Items aggregated from bill line items (fallback when the sales-profit
  /// report is unavailable).
  List<ItemAgg> items() {
    final map = <String, ItemAgg>{};
    for (final b in bills) {
      for (final i in b.items) {
        final a = map.putIfAbsent(i.itemId, () => ItemAgg(i.itemId, i.name, i.categoryName));
        a.qty += i.quantity;
        a.revenue += i.amount;
      }
    }
    return map.values.toList()..sort((a, b) => b.revenue.compareTo(a.revenue));
  }

  List<Slice> expenseCategories() {
    final m = <String, double>{};
    final c = <String, int>{};
    for (final e in expenses) {
      m[e.categoryName] = (m[e.categoryName] ?? 0) + e.amount;
      c[e.categoryName] = (c[e.categoryName] ?? 0) + 1;
    }
    return m.entries.map((e) => Slice(e.key, e.value, c[e.key]!)).toList()..sort((a, b) => b.value.compareTo(a.value));
  }

  /// Hour with the most revenue, or null with no sales.
  int? get peakHour {
    final h = hourly();
    if (bills.isEmpty) return null;
    var best = 0;
    for (var i = 1; i < 24; i++) {
      if (h[i].value > h[best].value) best = i;
    }
    return best;
  }

  TrendPoint? get bestDay {
    final t = dailyTrend().where((p) => p.revenue > 0).toList();
    if (t.isEmpty) return null;
    return t.reduce((a, b) => a.revenue >= b.revenue ? a : b);
  }
}

/// Percentage change from [prev] to [cur], or null when there is no base.
double? pctChange(num cur, num prev) {
  if (prev == 0) return cur == 0 ? 0 : null;
  return (cur - prev) / prev.abs() * 100;
}

/// Collapse a sorted slice list into the top [n] plus an "Other" bucket so a
/// chart never needs more than n+1 colours.
List<Slice> topWithOther(List<Slice> slices, int n, {String otherLabel = 'Other'}) {
  if (slices.length <= n + 1) return slices;
  final head = slices.take(n).toList();
  final tail = slices.skip(n);
  head.add(Slice(otherLabel, tail.fold(0.0, (s, e) => s + e.value), tail.fold(0, (s, e) => s + e.count)));
  return head;
}
