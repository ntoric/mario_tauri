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
import '../../theme/palettes.dart';
import '../../theme/theme_controller.dart';
import '../../widgets/bills.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/loader.dart';
import '../../widgets/nav.dart';
import '../../widgets/page_scaffold.dart';
import '../reports/item_sales_report.dart';
import '../reports/orders_report.dart';
import '../reports/payments_report.dart';
import '../reports/profit_loss_report.dart';
import '../reports/sales_trend_report.dart';
import '../stores/store_comparison_screen.dart';

class DashboardData {
  final RevenueReport current;
  final RevenueReport previous;
  final SalesProfitReport? items;
  final CategorySalesReport? categories;
  final List<Order> live;
  final SalesAnalytics a;

  DashboardData(this.current, this.previous, this.items, this.categories, this.live, DateRange range)
      : a = SalesAnalytics(current.bills, current.expenses, range);
}

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  static Future<DashboardData> load(OwnerRepository repo, String storeId, DateRange range, bool force) async {
    final includesToday = !range.end.isBefore(DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day));
    // Secondary widgets must not take the whole dashboard down if their
    // endpoint fails, so they resolve to null / empty.
    final results = await Future.wait<Object?>([
      repo.revenue(storeId, range, force: force),
      repo.revenueSummary(storeId, range.previous, force: force),
      repo.salesProfit(storeId, range, force: force).then<SalesProfitReport?>((v) => v).catchError((_) => null),
      repo.categorySales(storeId, range, force: force).then<CategorySalesReport?>((v) => v).catchError((_) => null),
      includesToday
          ? repo.liveOrders(storeId, force: force).catchError((_) => <Order>[])
          : Future.value(<Order>[]),
    ]);
    return DashboardData(
      results[0] as RevenueReport,
      results[1] as RevenueReport,
      results[2] as SalesProfitReport?,
      results[3] as CategorySalesReport?,
      results[4] as List<Order>,
      range,
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final store = s.store!;
    final range = s.range;
    return PageScaffold(
      actions: [
        if (s.stores.length > 1)
          IconButton(
            tooltip: 'Compare stores',
            icon: const Icon(Icons.compare_arrows_rounded),
            onPressed: () => push(context, const StoreComparisonScreen()),
          ),
      ],
      body: Loader<DashboardData>(
        depsKey: '${store.id}|${range.key}',
        load: (force) => load(repo, store.id, range, force),
        builder: (context, d) => _DashboardBody(d: d, range: range),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.d, required this.range});

  final DashboardData d;
  final DateRange range;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = d.a;
    final cur = d.current;
    final prev = d.previous;
    final profit = cur.totalRevenue - cur.totalExpenses;
    final prevProfit = prev.totalRevenue - prev.totalExpenses;
    final prevLabel = range.isSingleDay ? 'previous day' : 'previous ${range.days} days';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        _HeroCard(
          revenue: cur.totalRevenue,
          delta: pctChange(cur.totalRevenue, prev.totalRevenue),
          prevRevenue: prev.totalRevenue,
          prevLabel: prevLabel,
          trend: range.isSingleDay ? a.hourly().map((e) => e.value).toList() : a.dailyTrend().map((e) => e.revenue).toList(),
          onTap: () => push(context, const SalesTrendReport()),
        ),
        if (d.live.isNotEmpty) ...[
          const SizedBox(height: 12),
          _LiveCard(orders: d.live),
        ],
        const SizedBox(height: 12),
        TileGrid(children: [
          KpiTile(
            label: 'Bills',
            value: cur.totalBills,
            money: false,
            icon: Icons.receipt_long_rounded,
            delta: pctChange(cur.totalBills, prev.totalBills),
            onTap: () => push(context, const OrdersReport()),
          ),
          KpiTile(
            label: 'Avg. bill value',
            value: cur.avgBill,
            icon: Icons.shopping_bag_outlined,
            delta: pctChange(cur.avgBill, prev.avgBill),
          ),
          KpiTile(
            label: 'Net profit',
            value: profit,
            icon: Icons.trending_up_rounded,
            delta: pctChange(profit, prevProfit),
            footnote: 'Sales − expenses',
            onTap: () => push(context, const ProfitLossReport()),
          ),
          KpiTile(
            label: 'Expenses',
            value: cur.totalExpenses,
            icon: Icons.account_balance_wallet_outlined,
            delta: pctChange(cur.totalExpenses, prev.totalExpenses),
            invertDelta: true,
            footnote: '${cur.totalExpenseCount} entries',
            onTap: () => push(context, const ProfitLossReport()),
          ),
          KpiTile(
            label: 'Items sold',
            value: d.items?.unitsSold ?? a.itemsSold,
            money: false,
            icon: Icons.local_dining_outlined,
            showDelta: false,
            footnote: '${a.avgItemsPerBill.toStringAsFixed(1)} per bill',
            onTap: () => push(context, const ItemSalesReport()),
          ),
          KpiTile(
            label: 'Tax collected',
            value: a.tax,
            icon: Icons.account_balance_outlined,
            showDelta: false,
            footnote: a.discount > 0 ? '${Fmt.money(a.discount)} discounts' : 'No discounts',
          ),
        ]),
        const SizedBox(height: 12),
        _InsightsRow(d: d, range: range),
        const SizedBox(height: 12),
        SectionCard(
          title: range.isSingleDay ? 'Sales by hour' : 'Sales vs expenses',
          subtitle: range.subtitle,
          trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
          onTap: () => push(context, const SalesTrendReport()),
          child: range.isSingleDay ? _HourlyChart(a: a) : _TrendBlock(a: a),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Payment methods',
          trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
          onTap: () => push(context, const PaymentsReport()),
          child: DonutChart(
            centerLabel: 'Collected',
            slices: [
              for (final sl in topWithOther(a.paymentMethods(), 5))
                DonutSlice(Fmt.label(sl.key), sl.value, detail: '${sl.count} bills', isOther: sl.key == 'Other'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _TopItemsCard(d: d),
        if (d.categories != null && d.categories!.totals.isNotEmpty) ...[
          const SizedBox(height: 12),
          SectionCard(
            title: 'Category share',
            subtitle: 'Revenue by menu category',
            child: DonutChart(
              centerLabel: 'Menu sales',
              slices: [
                for (final sl in topWithOther(
                  d.categories!.totals.map((t) => Slice(t.category, t.revenue, t.count)).toList(),
                  5,
                ))
                  DonutSlice(sl.key, sl.value, detail: '${Fmt.number(sl.count)} sold', isOther: sl.key == 'Other'),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        SectionCard(
          title: 'Order channels',
          subtitle: 'Dine-in, parcel and delivery partners',
          child: DonutChart(
            centerLabel: 'Sales',
            slices: [
              for (final sl in topWithOther(a.channels(), 5))
                DonutSlice(Fmt.label(sl.key), sl.value, detail: '${sl.count} bills', isOther: sl.key == 'Other'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _RecentBills(bills: a.bills.take(5).toList()),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.revenue,
    required this.delta,
    required this.prevRevenue,
    required this.prevLabel,
    required this.trend,
    required this.onTap,
  });

  final double revenue;
  final double? delta;
  final double prevRevenue;
  final String prevLabel;
  final List<double> trend;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final compact = context.watch<ThemeController>().compactNumbers;
    final onAccent = Theme.of(context).colorScheme.onPrimary;
    final hsl = HSLColor.fromColor(c.accent);
    final deep = hsl.withLightness((hsl.lightness - 0.12).clamp(0.0, 1.0)).toColor();
    return Material(
      borderRadius: BorderRadius.circular(24),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c.accent, deep]),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -40,
                top: -40,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: onAccent.withValues(alpha: 0.07)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('Net sales', style: context.text.labelLarge?.copyWith(color: onAccent.withValues(alpha: 0.85))),
                        const Spacer(),
                        if (delta != null || prevRevenue == 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: onAccent.withValues(alpha: 0.16),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(
                                delta == null
                                    ? Icons.fiber_new_rounded
                                    : delta! >= 0
                                        ? Icons.arrow_upward_rounded
                                        : Icons.arrow_downward_rounded,
                                size: 14,
                                color: onAccent,
                              ),
                              const SizedBox(width: 3),
                              Text(
                                delta == null ? 'New' : '${delta!.abs().toStringAsFixed(1)}%',
                                style: context.text.labelMedium?.copyWith(color: onAccent, fontWeight: FontWeight.w700),
                              ),
                            ]),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        compact ? Fmt.compactMoney(revenue) : Fmt.money(revenue),
                        style: context.text.headlineMedium?.copyWith(color: onAccent, fontSize: 34, fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${Fmt.money(prevRevenue)} in the $prevLabel',
                      style: context.text.bodySmall?.copyWith(color: onAccent.withValues(alpha: 0.8)),
                    ),
                    const SizedBox(height: 14),
                    SizedBox(height: 44, child: _Sparkline(values: trend, color: onAccent)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Sparkline extends StatelessWidget {
  const _Sparkline({required this.values, required this.color});

  final List<double> values;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _SparkPainter(values, color), size: Size.infinite);
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color);

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final maxV = values.reduce((a, b) => a > b ? a : b);
    if (maxV <= 0) {
      final p = Paint()
        ..color = color.withValues(alpha: 0.4)
        ..strokeWidth = 2;
      canvas.drawLine(Offset(0, size.height - 1), Offset(size.width, size.height - 1), p);
      return;
    }
    final dx = size.width / (values.length - 1);
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = size.height - (values[i] / maxV) * (size.height - 4) - 2;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        final px = (i - 1) * dx;
        final py = size.height - (values[i - 1] / maxV) * (size.height - 4) - 2;
        path.cubicTo(px + dx / 2, py, x - dx / 2, y, x, y);
      }
    }
    final fill = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) => old.values != values || old.color != color;
}

class _LiveCard extends StatelessWidget {
  const _LiveCard({required this.orders});

  final List<Order> orders;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final value = orders.fold<double>(0, (s, o) => s + o.value);
    return SectionCard(
      onTap: () => push(context, const OrdersReport(initialLive: true)),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          const _PulseDot(),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${orders.length} open order${orders.length == 1 ? '' : 's'} right now', style: context.text.titleSmall),
                Text('${Fmt.money(value)} not yet billed', style: context.text.bodySmall),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: c.textMuted),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: StatusColors.good,
          boxShadow: [BoxShadow(color: StatusColors.good.withValues(alpha: 0.5 * _c.value), blurRadius: 8, spreadRadius: 4 * _c.value)],
        ),
      ),
    );
  }
}

class _InsightsRow extends StatelessWidget {
  const _InsightsRow({required this.d, required this.range});

  final DashboardData d;
  final DateRange range;

  @override
  Widget build(BuildContext context) {
    final a = d.a;
    final peak = a.peakHour;
    final best = a.bestDay;
    final topItem = d.items?.rows.isNotEmpty == true ? d.items!.rows.first.name : (a.items().isNotEmpty ? a.items().first.name : null);
    final topCat = d.categories?.totals.isNotEmpty == true ? d.categories!.totals.first.category : null;
    final cards = <Widget>[
      if (peak != null) _Insight(icon: Icons.schedule_rounded, label: 'Peak hour', value: '${Fmt.hour(peak)} – ${Fmt.hour((peak + 1) % 24)}'),
      if (!range.isSingleDay && best != null)
        _Insight(icon: Icons.emoji_events_outlined, label: 'Best day', value: '${Fmt.shortDate(best.day)} · ${Fmt.compactMoney(best.revenue)}'),
      if (topItem != null) _Insight(icon: Icons.star_outline_rounded, label: 'Top item', value: topItem),
      if (topCat != null) _Insight(icon: Icons.category_outlined, label: 'Top category', value: topCat),
      if (a.largestBill != null) _Insight(icon: Icons.receipt_outlined, label: 'Largest bill', value: Fmt.money(a.largestBill!.total)),
    ];
    if (cards.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }
}

class _Insight extends StatelessWidget {
  const _Insight({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      constraints: const BoxConstraints(minWidth: 150, maxWidth: 220),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: c.border)),
      child: Row(
        children: [
          Icon(icon, size: 20, color: c.accent),
          const SizedBox(width: 10),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(label, style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                const SizedBox(height: 2),
                Text(value, style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HourlyChart extends StatelessWidget {
  const _HourlyChart({required this.a});

  final SalesAnalytics a;

  @override
  Widget build(BuildContext context) {
    final h = a.hourly();
    if (a.bills.isEmpty) {
      return const EmptyState(icon: Icons.bar_chart_rounded, title: 'No sales yet', message: 'Bills will appear here as they are generated.');
    }
    final first = h.indexWhere((e) => e.value > 0);
    final last = h.lastIndexWhere((e) => e.value > 0);
    final from = (first - 1).clamp(0, 23);
    final to = (last + 1).clamp(0, 23);
    final slice = h.sublist(from, to + 1);
    final peak = a.peakHour! - from;
    return ColumnChart(
      labels: [for (var i = from; i <= to; i++) Fmt.hour(i)],
      tooltipLabels: [for (var i = from; i <= to; i++) '${Fmt.hour(i)} – ${Fmt.hour((i + 1) % 24)} · ${h[i].count} bills'],
      values: slice.map((e) => e.value).toList(),
      highlight: peak,
      labelEvery: slice.length > 10 ? 3 : (slice.length > 6 ? 2 : 1),
    );
  }
}

class _TrendBlock extends StatelessWidget {
  const _TrendBlock({required this.a});

  final SalesAnalytics a;

  @override
  Widget build(BuildContext context) {
    final t = a.dailyTrend();
    final b = context.brightness;
    final salesColor = context.colors.accent;
    final expColor = ChartPalette.series(1, b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ChartLegend([('Sales', salesColor), ('Expenses', expColor)]),
        const SizedBox(height: 12),
        TrendChart(
          labels: t.map((p) => Fmt.shortDate(p.day)).toList(),
          series: [
            TrendSeries('Sales', t.map((p) => p.revenue).toList(), salesColor, filled: true),
            TrendSeries('Expenses', t.map((p) => p.expenses).toList(), expColor),
          ],
        ),
      ],
    );
  }
}

class _TopItemsCard extends StatelessWidget {
  const _TopItemsCard({required this.d});

  final DashboardData d;

  @override
  Widget build(BuildContext context) {
    final rows = d.items?.rows.isNotEmpty == true
        ? d.items!.rows.take(5).map((r) => (r.name, r.category, r.qtySold, r.revenue)).toList()
        : d.a.items().take(5).map((r) => (r.name, r.category, r.qty, r.revenue)).toList();
    final maxRev = rows.isEmpty ? 1.0 : rows.map((r) => r.$4).reduce((a, b) => a > b ? a : b);
    return SectionCard(
      title: 'Top selling items',
      trailing: TextButton(onPressed: () => push(context, const ItemSalesReport()), child: const Text('See all')),
      child: rows.isEmpty
          ? const EmptyState(icon: Icons.restaurant_menu_rounded, title: 'No items sold in this period')
          : Column(
              children: [
                for (var i = 0; i < rows.length; i++)
                  RankRow(
                    rank: i + 1,
                    title: rows[i].$1,
                    subtitle: '${rows[i].$2.isEmpty ? 'Uncategorised' : rows[i].$2} · ${Fmt.number(rows[i].$3)} sold',
                    value: Fmt.money(rows[i].$4),
                    share: maxRev > 0 ? rows[i].$4 / maxRev : 0,
                  ),
              ],
            ),
    );
  }
}

class _RecentBills extends StatelessWidget {
  const _RecentBills({required this.bills});

  final List<Bill> bills;

  @override
  Widget build(BuildContext context) {
    if (bills.isEmpty) return const SizedBox.shrink();
    return SectionCard(
      title: 'Latest bills',
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(children: [for (final b in bills) BillTile(bill: b)]),
    );
  }
}
