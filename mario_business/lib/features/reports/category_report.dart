import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../models/reports.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

class CategoryReport extends StatelessWidget {
  const CategoryReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<CategorySalesReport>(
      title: 'Category performance',
      load: (repo, id, r, f) => repo.categorySales(id, r, force: f),
      builder: (context, d, range) {
        final c = context.colors;
        final b = context.brightness;
        final totals = d.totals;
        final slices = topWithOther(totals.map((t) => Slice(t.category, t.revenue, t.count)).toList(), 5);

        // Daily trend for the top three categories (three series stay
        // distinguishable for every colour-vision type).
        final top3 = totals.take(3).toList();
        final days = range.allDays;
        final dayKey = {for (var i = 0; i < days.length; i++) _ymd(days[i]): i};
        final series = <TrendSeries>[];
        for (var k = 0; k < top3.length; k++) {
          final vals = List<double>.filled(days.length, 0);
          for (final r in d.rows.where((r) => r.id == top3[k].categoryId)) {
            final i = dayKey[r.date];
            if (i != null) vals[i] += r.revenue;
          }
          series.add(TrendSeries(top3[k].category, vals, ChartPalette.series(k, b)));
        }

        return ReportList(children: [
          TileGrid(children: [
            KpiTile(label: 'Menu sales', value: d.totalRevenue, icon: Icons.payments_outlined, showDelta: false, footnote: 'At menu price'),
            KpiTile(label: 'Units sold', value: d.totalCount, money: false, icon: Icons.local_dining_outlined, showDelta: false, footnote: '${totals.length} categories'),
          ]),
          SectionCard(
            title: 'Revenue share',
            child: DonutChart(
              centerLabel: 'Menu sales',
              slices: [for (final s in slices) DonutSlice(s.key, s.value, detail: '${Fmt.number(s.count)} sold', isOther: s.key == 'Other')],
            ),
          ),
          if (!range.isSingleDay && series.isNotEmpty)
            SectionCard(
              title: 'Top categories over time',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ChartLegend([for (final s in series) (s.name, s.color)]),
                  const SizedBox(height: 12),
                  TrendChart(labels: days.map(Fmt.shortDate).toList(), series: series),
                ],
              ),
            ),
          SectionCard(
            title: 'All categories',
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: totals.isEmpty
                ? const EmptyState(icon: Icons.category_outlined, title: 'No category sales in this period')
                : Column(children: [
                    Row(children: [
                      Expanded(child: Text('Category', style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                      SizedBox(width: 56, child: Text('Units', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                      SizedBox(width: 52, child: Text('Share', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                      SizedBox(width: 90, child: Text('Revenue', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                    ]),
                    const SizedBox(height: 4),
                    for (final t in totals)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(children: [
                          Expanded(child: Text(t.category, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                          SizedBox(width: 56, child: Text(Fmt.number(t.count), textAlign: TextAlign.right, style: context.text.bodyMedium)),
                          SizedBox(
                            width: 52,
                            child: Text(d.totalRevenue > 0 ? Fmt.percent(t.revenue / d.totalRevenue * 100, digits: 0) : '—',
                                textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(color: c.textSecondary)),
                          ),
                          SizedBox(width: 90, child: Text(Fmt.money(t.revenue), textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700))),
                        ]),
                      ),
                  ]),
          ),
        ]);
      },
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
