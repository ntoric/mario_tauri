import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/date_range.dart';
import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../models/reports.dart';
import '../../theme/app_theme.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

enum _Group { day, week, month }

class SalesTrendReport extends StatelessWidget {
  const SalesTrendReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<(RevenueReport, RevenueReport)>(
      title: 'Sales trend',
      load: (repo, id, r, f) async {
        final res = await Future.wait([repo.revenue(id, r, force: f), repo.revenueSummary(id, r.previous, force: f)]);
        return (res[0], res[1]);
      },
      builder: (context, d, range) => _Body(cur: d.$1, prev: d.$2, range: range),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.cur, required this.prev, required this.range});

  final RevenueReport cur;
  final RevenueReport prev;
  final DateRange range;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  _Group _group = _Group.day;

  List<(String, String, double, int)> _grouped(List<TrendPoint> t) {
    if (_group == _Group.day) {
      return [for (final p in t) (Fmt.shortDate(p.day), Fmt.date(p.day), p.revenue, p.bills)];
    }
    final map = <DateTime, (double, int)>{};
    for (final p in t) {
      final k = _group == _Group.week
          ? p.day.subtract(Duration(days: p.day.weekday - 1))
          : DateTime(p.day.year, p.day.month, 1);
      final v = map[k] ?? (0.0, 0);
      map[k] = (v.$1 + p.revenue, v.$2 + p.bills);
    }
    final keys = map.keys.toList()..sort();
    return [
      for (final k in keys)
        _group == _Group.week
            ? (Fmt.shortDate(k), 'Week of ${Fmt.date(k)}', map[k]!.$1, map[k]!.$2)
            : (DateFormat('MMM yy').format(k), DateFormat('MMMM yyyy').format(k), map[k]!.$1, map[k]!.$2),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = SalesAnalytics(widget.cur.bills, widget.cur.expenses, widget.range);
    final trend = a.dailyTrend();
    final groups = _grouped(trend);
    final wd = a.weekdays();
    final activeDays = trend.where((p) => p.revenue > 0).length;
    final avgDaily = activeDays == 0 ? 0.0 : a.revenue / activeDays;
    final bestWd = wd.indexed.reduce((x, y) => x.$2.value >= y.$2.value ? x : y).$1;

    return ReportList(children: [
      TileGrid(children: [
        KpiTile(label: 'Net sales', value: widget.cur.totalRevenue, icon: Icons.payments_outlined, delta: pctChange(widget.cur.totalRevenue, widget.prev.totalRevenue)),
        KpiTile(label: 'Bills', value: widget.cur.totalBills, money: false, icon: Icons.receipt_long_outlined, delta: pctChange(widget.cur.totalBills, widget.prev.totalBills)),
        KpiTile(label: 'Avg. per trading day', value: avgDaily, icon: Icons.calendar_today_outlined, showDelta: false, footnote: '$activeDays of ${widget.range.days} days had sales'),
        KpiTile(label: 'Avg. bill value', value: widget.cur.avgBill, icon: Icons.shopping_bag_outlined, delta: pctChange(widget.cur.avgBill, widget.prev.avgBill)),
      ]),
      if (!widget.range.isSingleDay)
        SectionCard(
          title: 'Sales over time',
          trailing: SegmentedButton<_Group>(
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
            segments: const [
              ButtonSegment(value: _Group.day, label: Text('Day')),
              ButtonSegment(value: _Group.week, label: Text('Week')),
              ButtonSegment(value: _Group.month, label: Text('Month')),
            ],
            selected: {_group},
            onSelectionChanged: (s) => setState(() => _group = s.first),
          ),
          child: groups.length > 45
              ? TrendChart(
                  labels: groups.map((g) => g.$1).toList(),
                  series: [TrendSeries('Sales', groups.map((g) => g.$3).toList(), c.accent, filled: true)],
                )
              : ColumnChart(
                  labels: groups.map((g) => g.$1).toList(),
                  tooltipLabels: groups.map((g) => '${g.$2} · ${g.$4} bills').toList(),
                  values: groups.map((g) => g.$3).toList(),
                ),
        ),
      SectionCard(
        title: 'Sales by hour',
        subtitle: 'When customers buy',
        child: ColumnChart(
          labels: [for (var h = 0; h < 24; h++) Fmt.hour(h)],
          tooltipLabels: [for (final s in a.hourly()) '${Fmt.hour(int.parse(s.key))}–${Fmt.hour((int.parse(s.key) + 1) % 24)} · ${s.count} bills'],
          values: a.hourly().map((e) => e.value).toList(),
          highlight: a.peakHour,
          labelEvery: 4,
        ),
      ),
      if (widget.range.days >= 7) ...[
        SectionCard(
          title: 'Sales by weekday',
          subtitle: a.bills.isEmpty ? null : 'Best day: ${const ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][bestWd]}',
          child: ColumnChart(
            labels: [for (var i = 1; i <= 7; i++) Fmt.weekday(i)],
            tooltipLabels: [for (final s in wd) '${Fmt.weekday(int.parse(s.key))} · ${s.count} bills'],
            values: wd.map((e) => e.value).toList(),
            highlight: a.bills.isEmpty ? null : bestWd,
          ),
        ),
        SectionCard(
          title: 'Busy hours heatmap',
          subtitle: 'Revenue by weekday and hour',
          child: HourHeatmap(grid: a.heatmap()),
        ),
      ],
      SectionCard(
        title: 'Breakdown',
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Column(
          children: [
            Row(children: [
              Expanded(child: Text(_group == _Group.day || widget.range.isSingleDay ? 'Date' : 'Period', style: context.text.labelSmall?.copyWith(color: c.textMuted))),
              SizedBox(width: 60, child: Text('Bills', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
              SizedBox(width: 100, child: Text('Sales', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
            ]),
            const SizedBox(height: 6),
            for (final g in groups.reversed)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(children: [
                  Expanded(child: Text(g.$2, style: context.text.bodyMedium)),
                  SizedBox(width: 60, child: Text('${g.$4}', textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(color: c.textSecondary))),
                  SizedBox(
                    width: 100,
                    child: Text(Fmt.money(g.$3), textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                ]),
              ),
          ],
        ),
      ),
    ]);
  }
}
