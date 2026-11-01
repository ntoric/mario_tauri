import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/date_range.dart';
import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../data/owner_repository.dart';
import '../../models/reports.dart';
import '../../models/sales.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../widgets/bills.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/loader.dart';
import '../../widgets/page_scaffold.dart';

enum BillSort { newest, oldest, highest, lowest }

extension on BillSort {
  String get label => switch (this) {
        BillSort.newest => 'Newest',
        BillSort.oldest => 'Oldest',
        BillSort.highest => 'Highest value',
        BillSort.lowest => 'Lowest value',
      };
}

/// Sales tab: period summary, daily/hourly chart, and a searchable,
/// filterable list of every bill (read-only).
class SalesScreen extends StatelessWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final store = s.store!;
    final range = s.range;
    return PageScaffold(
      body: Loader<RevenueReport>(
        depsKey: '${store.id}|${range.key}',
        load: (force) => repo.revenue(store.id, range, force: force),
        skeleton: const Column(children: [
          SkeletonBox(height: 90, radius: 20),
          SizedBox(height: 12),
          SkeletonBox(height: 220, radius: 20),
          SizedBox(height: 12),
          ListSkeleton(rows: 5),
        ]),
        builder: (context, r) => _SalesBody(report: r, range: range),
      ),
    );
  }
}

class _SalesBody extends StatefulWidget {
  const _SalesBody({required this.report, required this.range});

  final RevenueReport report;
  final DateRange range;

  @override
  State<_SalesBody> createState() => _SalesBodyState();
}

class _SalesBodyState extends State<_SalesBody> {
  String _query = '';
  String? _payment;
  String? _channel;
  BillSort _sort = BillSort.newest;
  late SalesAnalytics _a;

  @override
  void initState() {
    super.initState();
    _a = SalesAnalytics(widget.report.bills, widget.report.expenses, widget.range);
  }

  @override
  void didUpdateWidget(covariant _SalesBody old) {
    super.didUpdateWidget(old);
    if (old.report != widget.report) {
      _a = SalesAnalytics(widget.report.bills, widget.report.expenses, widget.range);
      _payment = null;
      _channel = null;
    }
  }

  List<Bill> get _filtered {
    final q = _query.trim().toLowerCase();
    final list = _a.bills.where((b) {
      if (_payment != null && b.paymentMethod.toLowerCase() != _payment) return false;
      if (_channel != null && b.channel != _channel) return false;
      if (q.isEmpty) return true;
      return b.invoiceNo.toLowerCase().contains(q) ||
          b.tableLabel.toLowerCase().contains(q) ||
          b.customerName.toLowerCase().contains(q) ||
          b.customerMobile.contains(q) ||
          b.items.any((i) => i.name.toLowerCase().contains(q)) ||
          b.lines.any((i) => i.name.toLowerCase().contains(q));
    }).toList();
    switch (_sort) {
      case BillSort.newest:
        list.sort((a, b) => b.generatedAt.compareTo(a.generatedAt));
      case BillSort.oldest:
        list.sort((a, b) => a.generatedAt.compareTo(b.generatedAt));
      case BillSort.highest:
        list.sort((a, b) => b.total.compareTo(a.total));
      case BillSort.lowest:
        list.sort((a, b) => a.total.compareTo(b.total));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final bills = _filtered;
    final total = bills.fold<double>(0, (s, b) => s + b.total);
    final payments = _a.paymentMethods().map((e) => e.key).toList();
    final channels = _a.channels().map((e) => e.key).toList();

    final header = <Widget>[
      SectionCard(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            StatPair('Net sales', Fmt.money(_a.revenue)),
            StatPair('Bills', Fmt.number(_a.bills.length)),
            StatPair('Avg. bill', Fmt.money(_a.avgBill)),
          ],
        ),
      ),
      const SizedBox(height: 12),
      SectionCard(
        title: widget.range.isSingleDay ? 'Hourly sales' : 'Daily sales',
        child: _a.bills.isEmpty
            ? const EmptyState(icon: Icons.bar_chart_rounded, title: 'No sales in this period')
            : widget.range.isSingleDay
                ? ColumnChart(
                    labels: [for (var h = 0; h < 24; h++) Fmt.hour(h)],
                    tooltipLabels: [for (final sl in _a.hourly()) '${Fmt.hour(int.parse(sl.key))} · ${sl.count} bills'],
                    values: _a.hourly().map((e) => e.value).toList(),
                    highlight: _a.peakHour,
                    labelEvery: 4,
                  )
                : widget.range.days <= 45
                    ? ColumnChart(
                        labels: _a.dailyTrend().map((p) => Fmt.shortDate(p.day)).toList(),
                        tooltipLabels: _a.dailyTrend().map((p) => '${Fmt.date(p.day)} · ${p.bills} bills').toList(),
                        values: _a.dailyTrend().map((p) => p.revenue).toList(),
                      )
                    : TrendChart(
                        labels: _a.dailyTrend().map((p) => Fmt.shortDate(p.day)).toList(),
                        series: [TrendSeries('Sales', _a.dailyTrend().map((p) => p.revenue).toList(), c.accent, filled: true)],
                      ),
      ),
      const SizedBox(height: 16),
      TextField(
        decoration: const InputDecoration(
          prefixIcon: Icon(Icons.search_rounded),
          hintText: 'Search invoice, table, customer, item…',
        ),
        onChanged: (v) => setState(() => _query = v),
      ),
      const SizedBox(height: 10),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _FilterMenu<BillSort>(
              icon: Icons.sort_rounded,
              label: _sort.label,
              active: _sort != BillSort.newest,
              options: BillSort.values,
              optionLabel: (s) => s.label,
              onSelected: (s) => setState(() => _sort = s ?? BillSort.newest),
              allowClear: false,
            ),
            const SizedBox(width: 8),
            _FilterMenu<String>(
              icon: Icons.payments_outlined,
              label: _payment == null ? 'Payment' : Fmt.label(_payment!),
              active: _payment != null,
              options: payments,
              optionLabel: (s) => Fmt.label(s),
              onSelected: (s) => setState(() => _payment = s),
            ),
            const SizedBox(width: 8),
            _FilterMenu<String>(
              icon: Icons.storefront_outlined,
              label: _channel == null ? 'Channel' : Fmt.label(_channel!),
              active: _channel != null,
              options: channels,
              optionLabel: (s) => Fmt.label(s),
              onSelected: (s) => setState(() => _channel = s),
            ),
          ],
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 14, 4, 4),
        child: Row(
          children: [
            Text('${bills.length} bill${bills.length == 1 ? '' : 's'}', style: context.text.titleSmall),
            const Spacer(),
            Text(Fmt.money(total), style: context.text.titleSmall?.copyWith(color: c.textSecondary)),
          ],
        ),
      ),
    ];

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      itemCount: header.length + (bills.isEmpty ? 1 : bills.length),
      itemBuilder: (context, i) {
        if (i < header.length) return header[i];
        if (bills.isEmpty) {
          return const EmptyState(icon: Icons.receipt_long_outlined, title: 'No bills match', message: 'Try a different search or filter.');
        }
        final b = bills[i - header.length];
        return Container(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6))),
          ),
          child: BillTile(bill: b),
        );
      },
    );
  }
}

class _FilterMenu<T> extends StatelessWidget {
  const _FilterMenu({
    required this.icon,
    required this.label,
    required this.active,
    required this.options,
    required this.optionLabel,
    required this.onSelected,
    this.allowClear = true,
  });

  final IconData icon;
  final String label;
  final bool active;
  final List<T> options;
  final String Function(T) optionLabel;
  final ValueChanged<T?> onSelected;
  final bool allowClear;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return PopupMenuButton<Object>(
      onSelected: (v) => onSelected(v == '__clear__' ? null : v as T),
      color: c.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: c.border)),
      itemBuilder: (_) => [
        if (allowClear && active) const PopupMenuItem(value: '__clear__', child: Text('All')),
        for (final o in options) PopupMenuItem<Object>(value: o as Object, child: Text(optionLabel(o))),
      ],
      child: Container(
        height: 38,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active ? c.accentSoft : c.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? c.accent : c.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 16, color: active ? c.accent : c.textSecondary),
            const SizedBox(width: 6),
            Text(label, style: context.text.labelLarge?.copyWith(color: active ? c.accent : c.textSecondary)),
            const SizedBox(width: 2),
            Icon(Icons.arrow_drop_down_rounded, size: 20, color: active ? c.accent : c.textSecondary),
          ],
        ),
      ),
    );
  }
}
