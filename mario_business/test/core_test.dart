import 'package:flutter_test/flutter_test.dart';
import 'package:mario_business/core/api_client.dart';
import 'package:mario_business/core/date_range.dart';
import 'package:mario_business/core/format.dart';
import 'package:mario_business/data/analytics.dart';
import 'package:mario_business/models/reports.dart';
import 'package:mario_business/models/sales.dart';

Map<String, dynamic> bill(String id, double total, String at, {String pay = 'cash', int table = 1, String status = 'active'}) => {
      'id': id,
      'total': total,
      'taxTotal': total * 0.05,
      'paymentMethod': pay,
      'tableNumber': table,
      'status': status,
      'generatedAt': at,
      'items': [
        {
          'itemId': 'i1',
          'quantity': 2,
          'unitPrice': total / 2,
          'item': {'name': 'Latte', 'categoryName': 'Coffee'},
        }
      ],
    };

void main() {
  group('DateRange', () {
    final now = DateTime(2026, 3, 15, 18, 30);

    test('presets', () {
      final today = DateRange.preset(RangePreset.today, now: now);
      expect(today.startParam, '2026-03-15');
      expect(today.endParam, '2026-03-15');
      expect(today.days, 1);

      final last7 = DateRange.preset(RangePreset.last7, now: now);
      expect(last7.startParam, '2026-03-09');
      expect(last7.days, 7);

      final lastMonth = DateRange.preset(RangePreset.lastMonth, now: now);
      expect(lastMonth.startParam, '2026-02-01');
      expect(lastMonth.endParam, '2026-02-28');

      final jan = DateRange.preset(RangePreset.lastMonth, now: DateTime(2026, 1, 10));
      expect(jan.startParam, '2025-12-01');
      expect(jan.endParam, '2025-12-31');
    });

    test('previous period has equal length and ends the day before', () {
      final r = DateRange.custom(DateTime(2026, 3, 10), DateTime(2026, 3, 16));
      final p = r.previous;
      expect(p.days, 7);
      expect(p.endParam, '2026-03-09');
      expect(p.startParam, '2026-03-03');
    });

    test('custom range swaps reversed bounds', () {
      final r = DateRange.custom(DateTime(2026, 3, 16), DateTime(2026, 3, 10));
      expect(r.startParam, '2026-03-10');
    });
  });

  group('Fmt', () {
    test('compact uses Indian units', () {
      expect(Fmt.compact(950), '950');
      expect(Fmt.compact(12500), '12.5K');
      expect(Fmt.compact(120000), '1.2L');
      expect(Fmt.compact(35000000), '3.5Cr');
      expect(Fmt.compact(-2000), '-2K');
    });

    test('label', () {
      expect(Fmt.label('upi'), 'UPI');
      expect(Fmt.label('dine_in'), 'Dine In');
      expect(Fmt.label(''), 'Other');
    });

    test('money groups digits the Indian way', () {
      expect(Fmt.money(1234567), '₹12,34,567');
    });
  });

  group('ApiClient', () {
    test('normalises base URL to end with /api', () {
      expect(ApiClient(baseUrl: 'https://x.com').baseUrl, 'https://x.com/api');
      expect(ApiClient(baseUrl: 'https://x.com/api/').baseUrl, 'https://x.com/api');
    });
  });

  group('Models', () {
    test('bill parses with omitted fields and Go zero time', () {
      final b = Bill.fromJson({'id': 'b', 'total': '120.5', 'generatedAt': '2026-03-15T10:00:00Z', 'cancelledAt': '0001-01-01T00:00:00Z'});
      expect(b.total, 120.5);
      expect(b.items, isEmpty);
      expect(b.isParcel, isTrue);
      expect(b.channel, 'parcel');
    });

    test('delivery partner source becomes the channel', () {
      final b = Bill.fromJson({'id': 'b', 'tableNumber': 3, 'orderSource': 'swiggy'});
      expect(b.channel, 'swiggy');
    });

    test('revenue report avg bill', () {
      final r = RevenueReport.fromJson({'totalRevenue': 1000, 'totalBills': 4});
      expect(r.avgBill, 250);
    });

    test('gst summary', () {
      final g = GstSummary.fromJson({
        'invoices': {'count': 3, 'invoiceValue': 1050, 'taxableValue': 1000, 'cgst': 25, 'sgst': 25},
        'net': {'taxableValue': 900, 'cgst': 22.5, 'sgst': 22.5},
        'rateWise': [
          {'rate': 18, 'taxableValue': 100},
          {'rate': 5, 'taxableValue': 800, 'cgst': 20, 'sgst': 20},
        ],
      });
      expect(g.invoiceCount, 3);
      expect(g.net.totalTax, 45);
      expect(g.rateWise.first.rate, 5);
      expect(g.compositionTax, isNull);
    });
  });

  group('SalesAnalytics', () {
    final range = DateRange.custom(DateTime(2026, 3, 14), DateTime(2026, 3, 15));
    final bills = [
      bill('a', 100, '2026-03-14T09:15:00', pay: 'cash'),
      bill('b', 300, '2026-03-15T13:05:00', pay: 'upi', table: 0),
      bill('c', 200, '2026-03-15T13:45:00', pay: 'upi'),
      bill('x', 999, '2026-03-15T14:00:00', status: 'cancelled'),
    ].map(Bill.fromJson).toList();
    final a = SalesAnalytics(bills, [Expense.fromJson({'amount': 50, 'expenseDate': '2026-03-15T00:00:00', 'categoryName': 'Milk'})], range);

    test('excludes cancelled bills', () {
      expect(a.bills.length, 3);
      expect(a.revenue, 600);
      expect(a.avgBill, 200);
    });

    test('daily trend covers every day in range', () {
      final t = a.dailyTrend();
      expect(t.length, 2);
      expect(t[0].revenue, 100);
      expect(t[1].revenue, 500);
      expect(t[1].expenses, 50);
      expect(t[1].bills, 2);
    });

    test('peak hour, payments, channels', () {
      expect(a.peakHour, 13);
      final pay = a.paymentMethods();
      expect(pay.first.key, 'upi');
      expect(pay.first.value, 500);
      expect(a.channels().map((e) => e.key), containsAll(['dine_in', 'parcel']));
    });

    test('items aggregate quantity and revenue', () {
      final items = a.items();
      expect(items.single.qty, 6);
      expect(items.single.revenue, 600);
    });
  });

  test('topWithOther folds the tail', () {
    final s = List.generate(9, (i) => Slice('s$i', 10.0 - i, 1));
    final r = topWithOther(s, 5);
    expect(r.length, 6);
    expect(r.last.key, 'Other');
    expect(r.last.value, 5 + 4 + 3 + 2);
    expect(r.last.count, 4);
  });

  test('pctChange', () {
    expect(pctChange(150, 100), 50);
    expect(pctChange(0, 0), 0);
    expect(pctChange(10, 0), isNull);
  });
}
