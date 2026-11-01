import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../models/reports.dart';
import '../../models/sales.dart';
import '../../theme/app_theme.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

class ExpenseReport extends StatelessWidget {
  const ExpenseReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<(RevenueReport, RevenueReport)>(
      title: 'Expenses',
      load: (repo, id, r, f) async {
        final res = await Future.wait([repo.revenue(id, r, force: f), repo.revenueSummary(id, r.previous, force: f)]);
        return (res[0], res[1]);
      },
      builder: (context, d, range) => _ExpenseBody(cur: d.$1, prev: d.$2, rangeDays: range.days, a: SalesAnalytics(d.$1.bills, d.$1.expenses, range)),
    );
  }
}

class _ExpenseBody extends StatefulWidget {
  const _ExpenseBody({required this.cur, required this.prev, required this.rangeDays, required this.a});

  final RevenueReport cur;
  final RevenueReport prev;
  final int rangeDays;
  final SalesAnalytics a;

  @override
  State<_ExpenseBody> createState() => _ExpenseBodyState();
}

class _ExpenseBodyState extends State<_ExpenseBody> {
  String? _cat;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = widget.a;
    final cats = a.expenseCategories();
    final slices = topWithOther(cats, 5);
    final trend = a.dailyTrend();
    final list = (a.expenses.where((e) => _cat == null || e.categoryName == _cat).toList()..sort((x, y) => y.date.compareTo(x.date)));
    final vendors = <String, double>{};
    for (final e in a.expenses) {
      if (e.vendor.isNotEmpty) vendors[e.vendor] = (vendors[e.vendor] ?? 0) + e.amount;
    }
    final topVendors = vendors.entries.toList()..sort((x, y) => y.value.compareTo(x.value));
    final ratio = widget.cur.totalRevenue > 0 ? widget.cur.totalExpenses / widget.cur.totalRevenue * 100 : 0.0;

    return ReportList(children: [
      TileGrid(children: [
        KpiTile(
          label: 'Total expenses',
          value: widget.cur.totalExpenses,
          icon: Icons.wallet_outlined,
          delta: pctChange(widget.cur.totalExpenses, widget.prev.totalExpenses),
          invertDelta: true,
        ),
        KpiTile(label: 'Entries', value: widget.cur.totalExpenseCount, money: false, icon: Icons.list_alt_rounded, showDelta: false),
        KpiTile(label: 'Avg. per day', value: widget.cur.totalExpenses / widget.rangeDays, icon: Icons.calendar_today_outlined, showDelta: false),
        KpiTile(label: 'Expense-to-sales', value: ratio, display: Fmt.percent(ratio), icon: Icons.percent_rounded, showDelta: false, footnote: 'Expenses as a share of sales'),
      ]),
      SectionCard(
        title: 'By category',
        child: slices.isEmpty
            ? const EmptyState(icon: Icons.wallet_outlined, title: 'No expenses in this period')
            : DonutChart(
                centerLabel: 'Spent',
                slices: [for (final s in slices) DonutSlice(s.key, s.value, detail: '${s.count}×', isOther: s.key == 'Other')],
              ),
      ),
      if (widget.rangeDays > 1 && a.expenses.isNotEmpty)
        SectionCard(
          title: 'Daily spending',
          child: ColumnChart(
            labels: trend.map((p) => Fmt.shortDate(p.day)).toList(),
            tooltipLabels: trend.map((p) => Fmt.date(p.day)).toList(),
            values: trend.map((p) => p.expenses).toList(),
          ),
        ),
      if (topVendors.isNotEmpty)
        SectionCard(
          title: 'Top vendors',
          child: Column(children: [
            for (var i = 0; i < topVendors.length && i < 6; i++)
              RankRow(
                rank: i + 1,
                title: topVendors[i].key,
                value: Fmt.money(topVendors[i].value),
                share: topVendors[i].value / topVendors.first.value,
              ),
          ]),
        ),
      if (a.expenses.isNotEmpty) ...[
        ChoiceChips<String?>(
          options: [null, ...cats.map((e) => e.key)],
          selected: _cat,
          label: (v) => v ?? 'All categories',
          onSelected: (v) => setState(() => _cat = v),
        ),
        SectionCard(
          title: 'Entries',
          subtitle: '${list.length} · ${Fmt.money(list.fold<double>(0, (s, e) => s + e.amount))}',
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(children: [for (final e in list) _ExpenseTile(e: e)]),
        ),
      ],
      if (a.expenses.isEmpty) Text('No expenses were recorded in this period.', style: context.text.bodySmall?.copyWith(color: c.textMuted), textAlign: TextAlign.center),
    ]);
  }
}

class _ExpenseTile extends StatelessWidget {
  const _ExpenseTile({required this.e});

  final Expense e;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(12)),
            child: Icon(Icons.receipt_outlined, size: 19, color: c.textSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.title, style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(
                  [e.categoryName, Fmt.date(e.date), if (e.vendor.isNotEmpty) e.vendor, if (e.paymentMethod.isNotEmpty) Fmt.label(e.paymentMethod)].join(' · '),
                  style: context.text.labelSmall?.copyWith(color: c.textMuted),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(Fmt.money(e.amount), style: context.text.titleSmall),
        ],
      ),
    );
  }
}
