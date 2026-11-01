import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../models/reports.dart' as m;
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

/// Menu economics: selling price vs. preparation cost per item. Not tied
/// to a period — it reflects the current menu.
class MenuProfitReport extends StatelessWidget {
  const MenuProfitReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<m.MenuProfitReport>(
      title: 'Menu profitability',
      showRange: false,
      load: (repo, id, r, f) => repo.menuProfit(id, force: f),
      skeleton: const ListSkeleton(),
      builder: (context, d, _) => _Body(d: d),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.d});

  final m.MenuProfitReport d;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  bool _onlyCosted = true;
  bool _ascending = false;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final d = widget.d;
    final rows = d.rows.where((r) => !_onlyCosted || r.totalCost > 0).toList()
      ..sort((a, b) => _ascending ? a.profitPercent.compareTo(b.profitPercent) : b.profitPercent.compareTo(a.profitPercent));
    final costed = d.rows.where((r) => r.totalCost > 0).toList();
    final buckets = List<double>.filled(5, 0);
    for (final r in costed) {
      final p = r.profitPercent;
      final i = p < 20 ? 0 : p < 40 ? 1 : p < 60 ? 2 : p < 80 ? 3 : 4;
      buckets[i]++;
    }

    return ReportList(children: [
      TileGrid(children: [
        KpiTile(label: 'Avg. margin', value: d.averageProfitPercent, display: Fmt.percent(d.averageProfitPercent), icon: Icons.percent_rounded, showDelta: false, footnote: 'Across costed items'),
        KpiTile(label: 'Items with cost', value: d.itemsWithCostCount, display: '${d.itemsWithCostCount} / ${d.totalItems}', icon: Icons.fact_check_outlined, showDelta: false),
        KpiTile(label: 'Menu value', value: d.totalSellingValue, icon: Icons.sell_outlined, showDelta: false, footnote: 'Sum of item prices'),
        KpiTile(label: 'Profit per set', value: d.totalProfit, icon: Icons.trending_up_rounded, showDelta: false, footnote: 'One of each costed item'),
      ]),
      if (costed.isNotEmpty)
        SectionCard(
          title: 'Margin distribution',
          subtitle: 'Number of items per margin band',
          child: ColumnChart(
            height: 180,
            labels: const ['<20%', '20–40', '40–60', '60–80', '80%+'],
            tooltipLabels: const ['Under 20% margin', '20–40% margin', '40–60% margin', '60–80% margin', '80%+ margin'],
            values: buckets,
            valueFormat: Fmt.compact,
            tooltipFormat: (v) => '${v.toInt()} items',
          ),
        ),
      if (d.itemsWithCostCount < d.totalItems)
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            Icon(Icons.info_outline_rounded, size: 18, color: c.accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${d.totalItems - d.itemsWithCostCount} items have no preparation cost yet. Add costs in the POS menu to see their margins.',
                style: context.text.bodySmall?.copyWith(color: c.textPrimary),
              ),
            ),
          ]),
        ),
      Row(children: [
        FilterChip(
          label: const Text('Costed only'),
          selected: _onlyCosted,
          onSelected: (v) => setState(() => _onlyCosted = v),
        ),
        const Spacer(),
        TextButton.icon(
          onPressed: () => setState(() => _ascending = !_ascending),
          icon: Icon(_ascending ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, size: 16),
          label: Text(_ascending ? 'Lowest margin first' : 'Highest margin first'),
        ),
      ]),
      SectionCard(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: rows.isEmpty
            ? const EmptyState(icon: Icons.price_change_outlined, title: 'No items to show')
            : Column(children: [
                for (final r in rows)
                  Theme(
                    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      title: Text(r.item.name, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        '${r.item.categoryName.isEmpty ? 'Uncategorised' : r.item.categoryName} · ${Fmt.money2(r.item.price)}'
                        '${r.totalCost > 0 ? ' · cost ${Fmt.money2(r.totalCost)}' : ''}',
                        style: context.text.labelSmall?.copyWith(color: c.textMuted),
                      ),
                      trailing: r.totalCost > 0
                          ? Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(Fmt.percent(r.profitPercent),
                                    style: context.text.titleSmall?.copyWith(
                                      color: r.profitPercent < 20 ? StatusColors.down(context.brightness) : null,
                                    )),
                                Text(Fmt.money2(r.profit), style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                              ],
                            )
                          : Text('No cost', style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                      children: [
                        if (r.costs.isEmpty) Align(alignment: Alignment.centerLeft, child: Text('No cost breakdown', style: context.text.bodySmall)),
                        for (final cc in r.costs) InfoRow(cc.name, Fmt.money2(cc.amount)),
                        if (r.costs.isNotEmpty) InfoRow('Total cost', Fmt.money2(r.totalCost), bold: true),
                      ],
                    ),
                  ),
              ]),
      ),
    ]);
  }
}
