import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../models/reports.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/nav.dart';
import 'expense_report.dart';
import 'report_scaffold.dart';

class _PlData {
  final RevenueReport cur;
  final RevenueReport prev;
  final SalesProfitReport? items;
  _PlData(this.cur, this.prev, this.items);
}

/// Profit & loss statement for the period:
/// sales → less tax → less item preparation cost → less expenses → net.
class ProfitLossReport extends StatelessWidget {
  const ProfitLossReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<_PlData>(
      title: 'Profit & loss',
      load: (repo, id, r, f) async {
        final res = await Future.wait<Object?>([
          repo.revenue(id, r, force: f),
          repo.revenueSummary(id, r.previous, force: f),
          repo.salesProfit(id, r, force: f).then<SalesProfitReport?>((v) => v).catchError((_) => null),
        ]);
        return _PlData(res[0] as RevenueReport, res[1] as RevenueReport, res[2] as SalesProfitReport?);
      },
      builder: (context, d, range) {
        final c = context.colors;
        final b = context.brightness;
        final a = SalesAnalytics(d.cur.bills, d.cur.expenses, range);
        final sales = d.cur.totalRevenue;
        final tax = a.tax;
        final netSales = sales - tax;
        final cogs = d.items?.prepCost ?? 0;
        final gross = netSales - cogs;
        final expenses = d.cur.totalExpenses;
        final net = gross - expenses;
        final margin = sales > 0 ? net / sales * 100 : 0.0;
        final prevNet = d.prev.totalRevenue - d.prev.totalExpenses;
        final simpleNet = sales - expenses;
        final trend = a.dailyTrend();
        final expSlices = topWithOther(a.expenseCategories(), 5);
        final tracked = d.items != null && d.items!.itemsWithCostSold > 0;

        return ReportList(children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text('Net profit', style: context.text.labelLarge?.copyWith(color: c.textSecondary)),
                    const Spacer(),
                    DeltaBadge(pctChange(simpleNet, prevNet)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  Fmt.money(net),
                  style: context.text.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: net < 0 ? StatusColors.down(b) : null,
                  ),
                ),
                const SizedBox(height: 4),
                Text('${Fmt.percent(margin)} of sales · vs previous period on sales − expenses',
                    style: context.text.bodySmall?.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          SectionCard(
            title: 'Statement',
            subtitle: range.subtitle,
            child: Column(
              children: [
                _PlLine('Gross sales', sales, bold: true),
                _PlLine('Less: tax collected', -tax, muted: true),
                const Divider(height: 18),
                _PlLine('Net sales', netSales, bold: true),
                _PlLine('Less: item preparation cost', -cogs, muted: true, note: tracked ? null : 'No item costs recorded'),
                const Divider(height: 18),
                _PlLine('Gross profit', gross, bold: true, note: netSales > 0 ? '${Fmt.percent(gross / netSales * 100)} margin' : null),
                _PlLine('Less: operating expenses', -expenses, muted: true, note: '${d.cur.totalExpenseCount} entries'),
                const Divider(height: 18),
                _PlLine('Net profit', net, bold: true, highlight: true),
              ],
            ),
          ),
          if (d.items != null && d.items!.untrackedRevenue > 0)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(16)),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline_rounded, size: 18, color: c.accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${Fmt.money(d.items!.untrackedRevenue)} of item sales come from items without a preparation cost, '
                      'so gross profit is overstated. Add item costs in the POS menu to make this exact.',
                      style: context.text.bodySmall?.copyWith(color: c.textPrimary),
                    ),
                  ),
                ],
              ),
            ),
          if (!range.isSingleDay)
            SectionCard(
              title: 'Sales vs expenses',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ChartLegend([('Sales', c.accent), ('Expenses', ChartPalette.series(1, b))]),
                  const SizedBox(height: 12),
                  TrendChart(
                    labels: trend.map((p) => Fmt.shortDate(p.day)).toList(),
                    series: [
                      TrendSeries('Sales', trend.map((p) => p.revenue).toList(), c.accent, filled: true),
                      TrendSeries('Expenses', trend.map((p) => p.expenses).toList(), ChartPalette.series(1, b)),
                    ],
                  ),
                ],
              ),
            ),
          SectionCard(
            title: 'Where the money went',
            subtitle: 'Expenses by category',
            trailing: TextButton(onPressed: () => push(context, const ExpenseReport()), child: const Text('Details')),
            child: expSlices.isEmpty
                ? const EmptyState(icon: Icons.wallet_outlined, title: 'No expenses recorded')
                : DonutChart(
                    centerLabel: 'Expenses',
                    slices: [for (final s in expSlices) DonutSlice(s.key, s.value, detail: '${s.count}×', isOther: s.key == 'Other')],
                  ),
          ),
        ]);
      },
    );
  }
}

class _PlLine extends StatelessWidget {
  const _PlLine(this.label, this.value, {this.bold = false, this.muted = false, this.highlight = false, this.note});

  final String label;
  final double value;
  final bool bold;
  final bool muted;
  final bool highlight;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final neg = value < 0;
    final txt = '${neg ? '− ' : ''}${Fmt.money(value.abs())}';
    Color? color;
    if (highlight) color = neg ? StatusColors.down(context.brightness) : StatusColors.up(context.brightness);
    if (muted) color = c.textSecondary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: (bold ? context.text.titleSmall : context.text.bodyMedium)?.copyWith(color: muted ? c.textSecondary : null)),
                if (note != null) Text(note!, style: context.text.labelSmall?.copyWith(color: c.textMuted)),
              ],
            ),
          ),
          Text(
            txt,
            style: (bold ? context.text.titleSmall : context.text.bodyMedium)?.copyWith(
              fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
              color: color,
              fontSize: highlight ? 17 : null,
            ),
          ),
        ],
      ),
    );
  }
}
