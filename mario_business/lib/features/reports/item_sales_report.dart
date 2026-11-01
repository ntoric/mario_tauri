import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../products/products_screen.dart';
import 'report_scaffold.dart';

/// Item performance: best/worst sellers, profit leaders, ABC (Pareto)
/// classification and items with no sales.
class ItemSalesReport extends StatelessWidget {
  const ItemSalesReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<ProductsData>(
      title: 'Item performance',
      load: (repo, id, r, f) => loadProducts(repo, id, r, f),
      skeleton: const ListSkeleton(),
      builder: (context, d, range) {
        final c = context.colors;
        final rows = [...d.sales.rows]..sort((a, b) => b.revenue.compareTo(a.revenue));
        final byQty = [...rows]..sort((a, b) => b.qtySold.compareTo(a.qtySold));
        final costed = rows.where((r) => r.hasCostData).toList();
        final byProfit = [...costed]..sort((a, b) => b.profit.compareTo(a.profit));
        final lowMargin = [...costed]..sort((a, b) => a.profitPercent.compareTo(b.profitPercent));
        final slowest = byQty.reversed.take(5).toList();
        final soldIds = rows.map((r) => r.itemId).toSet();
        final unsold = d.items.where((i) => i.enabled && !soldIds.contains(i.id)).toList();

        // ABC: A = items making the first 80% of revenue, B = next 15%, C = rest.
        final total = rows.fold<double>(0, (s, r) => s + r.revenue);
        var running = 0.0;
        var aCount = 0, bCount = 0, cCount = 0;
        var aRev = 0.0, bRev = 0.0, cRev = 0.0;
        for (final r in rows) {
          final share = total > 0 ? running / total : 1;
          if (share < 0.8) {
            aCount++;
            aRev += r.revenue;
          } else if (share < 0.95) {
            bCount++;
            bRev += r.revenue;
          } else {
            cCount++;
            cRev += r.revenue;
          }
          running += r.revenue;
        }

        final top10 = rows.take(10).toList();

        return ReportList(children: [
          TileGrid(children: [
            KpiTile(label: 'Units sold', value: d.sales.unitsSold, money: false, icon: Icons.local_dining_outlined, showDelta: false),
            KpiTile(label: 'Distinct items sold', value: d.sales.itemsSold, money: false, icon: Icons.restaurant_menu_rounded, showDelta: false, footnote: 'of ${d.items.length} on the menu'),
          ]),
          if (top10.isNotEmpty)
            SectionCard(
              title: 'Top 10 by revenue',
              child: ColumnChart(
                height: 220,
                labels: [for (var i = 0; i < top10.length; i++) '${i + 1}'],
                tooltipLabels: top10.map((r) => '${r.name} · ${r.qtySold} sold').toList(),
                values: top10.map((r) => r.revenue).toList(),
              ),
            ),
          if (top10.isNotEmpty)
            SectionCard(
              padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
              child: Column(children: [
                for (var i = 0; i < top10.length; i++)
                  RankRow(
                    rank: i + 1,
                    title: top10[i].name,
                    subtitle: '${top10[i].category} · ${Fmt.number(top10[i].qtySold)} sold',
                    value: Fmt.money(top10[i].revenue),
                    share: top10.first.revenue > 0 ? top10[i].revenue / top10.first.revenue : 0,
                    onTap: () => showItemSheet(context, d, top10[i].itemId, fallbackName: top10[i].name),
                  ),
              ]),
            ),
          if (rows.isNotEmpty)
            SectionCard(
              title: 'ABC analysis',
              subtitle: 'Which items drive most of your revenue',
              child: Column(
                children: [
                  _AbcRow(label: 'A · top 80% of revenue', count: aCount, revenue: aRev, total: total, color: ChartPalette.series(0, context.brightness)),
                  _AbcRow(label: 'B · next 15%', count: bCount, revenue: bRev, total: total, color: ChartPalette.series(1, context.brightness)),
                  _AbcRow(label: 'C · last 5%', count: cCount, revenue: cRev, total: total, color: ChartPalette.series(2, context.brightness)),
                  const SizedBox(height: 8),
                  Text(
                    '$aCount item${aCount == 1 ? '' : 's'} (${rows.isEmpty ? 0 : (aCount / rows.length * 100).round()}% of items sold) bring in 80% of revenue. '
                    'Keep these always in stock; review C items for menu cleanup.',
                    style: context.text.bodySmall,
                  ),
                ],
              ),
            ),
          if (byProfit.isNotEmpty)
            SectionCard(
              title: 'Most profitable',
              subtitle: 'Gross profit after preparation cost',
              child: Column(children: [
                for (var i = 0; i < byProfit.length && i < 5; i++)
                  RankRow(
                    rank: i + 1,
                    title: byProfit[i].name,
                    subtitle: '${Fmt.percent(byProfit[i].profitPercent, digits: 0)} margin · ${Fmt.number(byProfit[i].qtySold)} sold',
                    value: Fmt.money(byProfit[i].profit),
                    share: byProfit.first.profit > 0 ? (byProfit[i].profit / byProfit.first.profit).clamp(0, 1).toDouble() : 0,
                  ),
              ]),
            ),
          if (lowMargin.isNotEmpty)
            SectionCard(
              title: 'Lowest margins',
              subtitle: 'Consider repricing or reducing cost',
              child: Column(children: [
                for (final r in lowMargin.take(5))
                  InfoRow(
                    r.name,
                    Fmt.percent(r.profitPercent),
                    valueColor: r.profitPercent < 20 ? StatusColors.down(context.brightness) : null,
                  ),
              ]),
            ),
          if (slowest.isNotEmpty && rows.length > 5)
            SectionCard(
              title: 'Slow movers',
              subtitle: 'Sold, but least often',
              child: Column(children: [
                for (final r in slowest) InfoRow(r.name, '${Fmt.number(r.qtySold)} sold · ${Fmt.money(r.revenue)}'),
              ]),
            ),
          if (unsold.isNotEmpty)
            SectionCard(
              title: 'No sales',
              subtitle: '${unsold.length} active items not sold in ${range.label.toLowerCase()}',
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final i in unsold.take(40))
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(10)),
                      child: Text(i.name, style: context.text.labelMedium),
                    ),
                  if (unsold.length > 40) Text('+${unsold.length - 40} more', style: context.text.labelMedium?.copyWith(color: c.textMuted)),
                ],
              ),
            ),
          if (rows.isEmpty) const EmptyState(icon: Icons.restaurant_menu_rounded, title: 'No item sales in this period'),
        ]);
      },
    );
  }
}

class _AbcRow extends StatelessWidget {
  const _AbcRow({required this.label, required this.count, required this.revenue, required this.total, required this.color});

  final String label;
  final int count;
  final double revenue;
  final double total;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 8),
            Expanded(child: Text(label, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600))),
            Text('$count items · ${Fmt.money(revenue)}', style: context.text.labelMedium?.copyWith(color: c.textSecondary)),
          ]),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: total > 0 ? revenue / total : 0,
              minHeight: 6,
              backgroundColor: c.cardAlt,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ],
      ),
    );
  }
}
