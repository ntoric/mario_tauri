import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/bill.dart';
import '../models/order.dart';
import '../models/user.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_ui.dart';

enum StatsPeriod { today, yesterday, last7, last30, allTime }

class StatsRange {
  final DateTime? start;
  final DateTime? end;

  const StatsRange(this.start, this.end);

  bool contains(DateTime time) {
    if (start != null && time.isBefore(start!)) return false;
    if (end != null && !time.isBefore(end!)) return false;
    return true;
  }
}

class StatsCalculator {
  static DateTime _dayStart(DateTime t) => DateTime(t.year, t.month, t.day);

  static StatsRange range(StatsPeriod period, DateTime now) {
    final todayStart = _dayStart(now);
    switch (period) {
      case StatsPeriod.today:
        return StatsRange(todayStart, null);
      case StatsPeriod.yesterday:
        return StatsRange(
            todayStart.subtract(const Duration(days: 1)), todayStart);
      case StatsPeriod.last7:
        return StatsRange(todayStart.subtract(const Duration(days: 6)), null);
      case StatsPeriod.last30:
        return StatsRange(todayStart.subtract(const Duration(days: 29)), null);
      case StatsPeriod.allTime:
        return const StatsRange(null, null);
    }
  }

  static StatsRange? previousRange(StatsPeriod period, DateTime now) {
    if (period == StatsPeriod.allTime) return null;
    final current = range(period, now);
    final start = current.start!;
    final end = current.end ?? now;
    final length = end.difference(start);
    return StatsRange(start.subtract(length), start);
  }

  static String comparisonLabel(StatsPeriod period) {
    switch (period) {
      case StatsPeriod.today:
        return 'vs. yesterday';
      case StatsPeriod.yesterday:
        return 'vs. day before';
      case StatsPeriod.last7:
        return 'vs. previous 7 days';
      case StatsPeriod.last30:
        return 'vs. previous 30 days';
      case StatsPeriod.allTime:
        return '';
    }
  }

  static String periodLabel(StatsPeriod period) {
    switch (period) {
      case StatsPeriod.today:
        return 'Today';
      case StatsPeriod.yesterday:
        return 'Yesterday';
      case StatsPeriod.last7:
        return 'Last 7 days';
      case StatsPeriod.last30:
        return 'Last 30 days';
      case StatsPeriod.allTime:
        return 'All time';
    }
  }

  static double revenue(Iterable<Bill> bills, StatsRange range) => bills
      .where((bill) => range.contains(bill.generatedAt))
      .fold<double>(0, (sum, bill) => sum + bill.total);

  static List<Bill> billsIn(Iterable<Bill> bills, StatsRange range) =>
      bills.where((bill) => range.contains(bill.generatedAt)).toList()
        ..sort((a, b) => b.generatedAt.compareTo(a.generatedAt));

  static int totalOrders(Iterable<Order> orders, StatsRange range) => orders
      .where((order) => !order.isCancelled && range.contains(order.createdAt))
      .length;

  static int completedOrders(Iterable<Order> orders, StatsRange range) => orders
      .where((order) => order.isCompleted && range.contains(order.createdAt))
      .length;

  static int activeOrders(Iterable<Order> orders, StatsRange range) => orders
      .where((order) => order.isActive && range.contains(order.createdAt))
      .length;

  /// Returns null when there is no meaningful change to show (prev == 0 and
  /// cur != 0).
  static int? changePercent(num current, num previous) {
    if (previous == 0) return current == 0 ? 0 : null;
    return ((current - previous) / previous * 100).round();
  }

  /// Bucket boundaries (start inclusive, end exclusive) for the sparkline
  /// series of a period.
  static List<StatsRange> buckets(StatsPeriod period, DateTime now) {
    final todayStart = _dayStart(now);
    switch (period) {
      case StatsPeriod.today:
        return List.generate(
          now.hour + 1,
          (i) => StatsRange(todayStart.add(Duration(hours: i)),
              todayStart.add(Duration(hours: i + 1))),
        );
      case StatsPeriod.yesterday:
        final start = todayStart.subtract(const Duration(days: 1));
        return List.generate(
          24,
          (i) => StatsRange(
              start.add(Duration(hours: i)), start.add(Duration(hours: i + 1))),
        );
      case StatsPeriod.last7:
        final start = todayStart.subtract(const Duration(days: 6));
        return List.generate(
          7,
          (i) => StatsRange(
              start.add(Duration(days: i)), start.add(Duration(days: i + 1))),
        );
      case StatsPeriod.last30:
        final start = todayStart.subtract(const Duration(days: 29));
        return List.generate(
          30,
          (i) => StatsRange(
              start.add(Duration(days: i)), start.add(Duration(days: i + 1))),
        );
      case StatsPeriod.allTime:
        final endOfLast = todayStart.add(const Duration(days: 1));
        return List.generate(
          12,
          (i) => StatsRange(endOfLast.subtract(Duration(days: 7 * (12 - i))),
              endOfLast.subtract(Duration(days: 7 * (11 - i)))),
        );
    }
  }

  static List<double> revenueSeries(
          Iterable<Bill> bills, List<StatsRange> buckets) =>
      buckets.map((bucket) => revenue(bills, bucket)).toList();

  static List<double> countSeries(
          Iterable<Order> orders, List<StatsRange> buckets,
          {bool Function(Order)? where}) =>
      buckets
          .map((bucket) => orders
              .where((order) =>
                  (where?.call(order) ?? true) &&
                  !order.isCancelled &&
                  bucket.contains(order.createdAt))
              .length
              .toDouble())
          .toList();

  static String paymentBucket(String? method) {
    switch (method?.toLowerCase()) {
      case 'upi':
        return 'upi';
      case 'cash':
        return 'cash';
      case 'card':
        return 'card';
      default:
        return 'other';
    }
  }

  /// Totals keyed by 'upi' | 'cash' | 'card' | 'other'.
  static Map<String, double> paymentTotals(
      Iterable<Bill> bills, StatsRange range) {
    final totals = {'upi': 0.0, 'cash': 0.0, 'card': 0.0, 'other': 0.0};
    for (final bill in bills) {
      if (!range.contains(bill.generatedAt)) continue;
      totals[paymentBucket(bill.paymentMethod)] =
          totals[paymentBucket(bill.paymentMethod)]! + bill.total;
    }
    return totals;
  }
}

int countStoreUsers(List<User> users, String storeId) {
  return users
      .where((u) => u.storeId == storeId || u.storeIds.contains(storeId))
      .length;
}

class StatisticsScreen extends StatefulWidget {
  final VoidCallback? onViewAllBills;

  const StatisticsScreen({super.key, this.onViewAllBills});

  @override
  State<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends State<StatisticsScreen> {
  bool _isLoading = true;
  bool _reloading = false;
  StatsPeriod _period = StatsPeriod.today;
  int? _storeUsers;
  String? _loadedStoreId;

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStoreUsers(String storeId) async {
    try {
      final users = await context.read<AuthProvider>().backend.api.getUsers();
      if (!mounted) return;
      setState(() => _storeUsers = countStoreUsers(users, storeId));
    } catch (_) {
      if (mounted) setState(() => _storeUsers = null);
    }
  }

  Future<void> _loadStats() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();
    if (auth.currentStore != null) {
      final storeId = auth.currentStore!.id;
      await Future.wait([
        data.loadBills(storeId),
        data.loadOrders(storeId),
        data.loadCategories(storeId),
        data.loadItems(storeId),
        data.loadTables(storeId),
        _loadStoreUsers(storeId),
      ]);
      _loadedStoreId = storeId;
    }
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final palette = context.watch<ThemeProvider>().currentTheme;
    final now = DateTime.now();

    // The screen lives in an IndexedStack — reload when the store changes.
    final currentStoreId = auth.currentStore?.id;
    if (currentStoreId != null &&
        currentStoreId != _loadedStoreId &&
        !_isLoading &&
        !_reloading) {
      _reloading = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        setState(() => _isLoading = true);
        await _loadStats();
        _reloading = false;
      });
    }

    final range = StatsCalculator.range(_period, now);
    final previous = StatsCalculator.previousRange(_period, now);
    final buckets = StatsCalculator.buckets(_period, now);

    final revenue = StatsCalculator.revenue(data.bills, range);
    final orders = StatsCalculator.totalOrders(data.orders, range);
    final completed = StatsCalculator.completedOrders(data.orders, range);
    final active = StatsCalculator.activeOrders(data.orders, range);

    final prevRevenue =
        previous == null ? 0.0 : StatsCalculator.revenue(data.bills, previous);
    final prevOrders = previous == null
        ? 0
        : StatsCalculator.totalOrders(data.orders, previous);
    final prevCompleted = previous == null
        ? 0
        : StatsCalculator.completedOrders(data.orders, previous);
    final prevActive = previous == null
        ? 0
        : StatsCalculator.activeOrders(data.orders, previous);

    final hasComparison = previous != null;
    final comparisonText = StatsCalculator.comparisonLabel(_period);
    final numberFormat = NumberFormat.decimalPattern('en_IN');

    final revenueBuckets = StatsCalculator.revenueSeries(data.bills, buckets);
    final orderBuckets = StatsCalculator.countSeries(data.orders, buckets);
    final completedBuckets = StatsCalculator.countSeries(data.orders, buckets,
        where: (o) => o.isCompleted);
    final activeBuckets = StatsCalculator.countSeries(data.orders, buckets,
        where: (o) => o.isActive);

    final periodBills = StatsCalculator.billsIn(data.bills, range);
    final paymentTotals = StatsCalculator.paymentTotals(data.bills, range);
    final paymentsTotal =
        paymentTotals.values.fold<double>(0, (sum, v) => sum + v);

    final isTablet = ResponsiveHelper.isTablet(context) ||
        ResponsiveHelper.isDesktop(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: ScreenHeader(
              title: 'Statistics',
              subtitle: auth.currentStore?.displayName,
              showSubtitleChevron: true,
              onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _loadStats,
                    color: palette.primary,
                    child: SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(16, 0, 16,
                          24 + MediaQuery.of(context).padding.bottom),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Align(
                            alignment: Alignment.centerRight,
                            child: _PeriodSelector(
                              period: _period,
                              onSelected: (period) =>
                                  setState(() => _period = period),
                            ),
                          ),
                          const SizedBox(height: 12),
                          StatsHeroCard(
                            revenue: revenue,
                            revenueText:
                                '₹${numberFormat.format(revenue.round())}',
                            change: hasComparison
                                ? StatsCalculator.changePercent(
                                    revenue, prevRevenue)
                                : null,
                            showComparison: hasComparison,
                            comparisonText: comparisonText,
                            totalOrders: orders,
                            completedOrders: completed,
                            revenueBuckets: revenueBuckets,
                          ),
                          const Padding(
                            padding: EdgeInsets.only(top: 20, bottom: 10),
                            child: Text(
                              'OVERVIEW',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.gray500,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                          GridView(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: isTablet ? 4 : 2,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                              mainAxisExtent: 132,
                            ),
                            children: [
                              StatsOverviewCard(
                                label: 'Total Revenue',
                                value:
                                    '₹${numberFormat.format(revenue.round())}',
                                icon: Icons.currency_rupee,
                                color: AppColors.tableAvailable,
                                change: hasComparison
                                    ? StatsCalculator.changePercent(
                                        revenue, prevRevenue)
                                    : null,
                                series: revenueBuckets,
                              ),
                              StatsOverviewCard(
                                label: 'Total Orders',
                                value: numberFormat.format(orders),
                                icon: Icons.receipt_long,
                                color: palette.highlight,
                                change: hasComparison
                                    ? StatsCalculator.changePercent(
                                        orders, prevOrders)
                                    : null,
                                series: orderBuckets,
                              ),
                              StatsOverviewCard(
                                label: 'Completed',
                                value: numberFormat.format(completed),
                                icon: Icons.check_circle,
                                color: AppColors.tableReserved,
                                change: hasComparison
                                    ? StatsCalculator.changePercent(
                                        completed, prevCompleted)
                                    : null,
                                series: completedBuckets,
                              ),
                              StatsOverviewCard(
                                label: 'Active Orders',
                                value: numberFormat.format(active),
                                icon: Icons.hourglass_bottom,
                                color: AppColors.tableOccupied,
                                change: hasComparison
                                    ? StatsCalculator.changePercent(
                                        active, prevActive)
                                    : null,
                                series: activeBuckets,
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          LayoutBuilder(
                            builder: (context, constraints) {
                              final paymentCard = PaymentMethodsCard(
                                totals: paymentTotals,
                                grandTotal: paymentsTotal,
                              );
                              final systemCard = SystemStatsCard(
                                users: _storeUsers,
                                categories: data.categories.length,
                                items: data.items.length,
                                tables: data.tables.length,
                                bills: data.bills.length,
                              );
                              if (constraints.maxWidth < 340) {
                                return Column(
                                  children: [
                                    systemCard,
                                    const SizedBox(height: 12),
                                    paymentCard,
                                  ],
                                );
                              }
                              return IntrinsicHeight(
                                child: Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Expanded(child: systemCard),
                                    const SizedBox(width: 12),
                                    Expanded(child: paymentCard),
                                  ],
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 12),
                          Padding(
                            padding: const EdgeInsets.only(top: 8, bottom: 10),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text(
                                  'RECENT BILLS',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.gray500,
                                    letterSpacing: 0.6,
                                  ),
                                ),
                                if (widget.onViewAllBills != null)
                                  InkWell(
                                    onTap: widget.onViewAllBills,
                                    borderRadius: BorderRadius.circular(8),
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 4, vertical: 2),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            'View All',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                              color: palette.highlight,
                                            ),
                                          ),
                                          Icon(Icons.chevron_right,
                                              size: 14,
                                              color: palette.highlight),
                                        ],
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          RecentBillsCard(bills: periodBills.take(5).toList()),
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _PeriodSelector extends StatelessWidget {
  final StatsPeriod period;
  final ValueChanged<StatsPeriod> onSelected;

  const _PeriodSelector({required this.period, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<StatsPeriod>(
      onSelected: onSelected,
      offset: const Offset(0, 44),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      itemBuilder: (context) => StatsPeriod.values
          .map(
            (p) => PopupMenuItem<StatsPeriod>(
              value: p,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      StatsCalculator.periodLabel(p),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.dark,
                      ),
                    ),
                  ),
                  if (p == period)
                    const Icon(Icons.check,
                        size: 18, color: AppColors.tableAvailable),
                ],
              ),
            ),
          )
          .toList(),
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.calendar_today_outlined,
                size: 16, color: AppColors.dark),
            const SizedBox(width: 8),
            Text(
              StatsCalculator.periodLabel(period),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down,
                size: 18, color: AppColors.gray600),
          ],
        ),
      ),
    );
  }
}

class StatsChangeBadge extends StatelessWidget {
  /// Null shows a neutral '—' badge.
  final int? change;
  final bool onDark;

  const StatsChangeBadge(
      {super.key, required this.change, this.onDark = false});

  @override
  Widget build(BuildContext context) {
    final value = change;
    if (onDark) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (value != null && value != 0)
              Icon(
                value > 0 ? Icons.arrow_upward : Icons.arrow_downward,
                size: 12,
                color: Colors.white,
              ),
            Text(
              value == null ? '—' : '${value > 0 ? '+' : ''}$value%',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    final Color color;
    if (value == null || value == 0) {
      color = AppColors.gray500;
    } else if (value > 0) {
      color = AppColors.tableAvailable;
    } else {
      color = AppColors.danger;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (value != null && value != 0)
            Icon(
              value > 0 ? Icons.arrow_upward : Icons.arrow_downward,
              size: 12,
              color: color,
            ),
          Text(
            value == null ? '—' : '${value > 0 ? '+' : ''}$value%',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class StatsHeroCard extends StatelessWidget {
  final double revenue;
  final String revenueText;
  final int? change;
  final bool showComparison;
  final String comparisonText;
  final int totalOrders;
  final int completedOrders;
  final List<double> revenueBuckets;

  const StatsHeroCard({
    super.key,
    required this.revenue,
    required this.revenueText,
    required this.change,
    required this.showComparison,
    required this.comparisonText,
    required this.totalOrders,
    required this.completedOrders,
    required this.revenueBuckets,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(palette.primaryDark, Colors.black, 0.55)!,
            Color.lerp(palette.primaryDark, Colors.black, 0.78)!,
          ],
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          children: [
            Positioned(
              top: 12,
              right: 0,
              width: 220,
              height: 90,
              child: Opacity(
                opacity: 0.35,
                child: Stack(
                  children: [
                    BarChart(
                      BarChartData(
                        barGroups: [
                          for (var i = 0; i < revenueBuckets.length; i++)
                            BarChartGroupData(
                              x: i,
                              barRods: [
                                BarChartRodData(
                                  toY: revenueBuckets[i],
                                  color: palette.primaryLight,
                                  width: 6,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ],
                            ),
                        ],
                        titlesData: const FlTitlesData(show: false),
                        gridData: const FlGridData(show: false),
                        borderData: FlBorderData(show: false),
                        barTouchData: BarTouchData(enabled: false),
                      ),
                    ),
                    LineChart(
                      LineChartData(
                        lineBarsData: [
                          LineChartBarData(
                            spots: [
                              for (var i = 0; i < revenueBuckets.length; i++)
                                FlSpot(i.toDouble(), revenueBuckets[i]),
                            ],
                            isCurved: true,
                            color: palette.primaryLight,
                            barWidth: 2,
                            dotData: const FlDotData(show: false),
                            belowBarData: BarAreaData(
                              show: true,
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  palette.primaryLight.withOpacity(0.4),
                                  palette.primaryLight.withOpacity(0),
                                ],
                              ),
                            ),
                          ),
                        ],
                        titlesData: const FlTitlesData(show: false),
                        gridData: const FlGridData(show: false),
                        borderData: FlBorderData(show: false),
                        lineTouchData: LineTouchData(enabled: false),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total Revenue',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.75),
                    ),
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      revenueText,
                      style: const TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (showComparison)
                    Row(
                      children: [
                        StatsChangeBadge(change: change, onDark: true),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            comparisonText,
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.white.withOpacity(0.7),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _heroTile(
                          icon: Icons.receipt_long,
                          iconColor: palette.highlight,
                          value: '$totalOrders',
                          label: 'Total Orders',
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _heroTile(
                          icon: Icons.check_circle,
                          iconColor: palette.primary,
                          value: '$completedOrders',
                          label: 'Completed Orders',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _heroTile({
    required IconData icon,
    required Color iconColor,
    required String value,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: iconColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withOpacity(0.7),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class StatsOverviewCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final int? change;
  final List<double> series;

  const StatsOverviewCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.change,
    required this.series,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    value,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.gray600,
              height: 1.2,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const Spacer(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: LineChart(
                    LineChartData(
                      lineBarsData: [
                        LineChartBarData(
                          spots: [
                            for (var i = 0; i < series.length; i++)
                              FlSpot(i.toDouble(), series[i]),
                          ],
                          isCurved: true,
                          color: color,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
                          belowBarData: BarAreaData(
                            show: true,
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                color.withOpacity(0.18),
                                color.withOpacity(0),
                              ],
                            ),
                          ),
                        ),
                      ],
                      titlesData: const FlTitlesData(show: false),
                      gridData: const FlGridData(show: false),
                      borderData: FlBorderData(show: false),
                      lineTouchData: LineTouchData(enabled: false),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StatsChangeBadge(change: change),
            ],
          ),
        ],
      ),
    );
  }
}

class SystemStatsCard extends StatelessWidget {
  final int? users;
  final int categories;
  final int items;
  final int tables;
  final int bills;

  const SystemStatsCard({
    super.key,
    required this.users,
    required this.categories,
    required this.items,
    required this.tables,
    required this.bills,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final numberFormat = NumberFormat.decimalPattern('en_IN');

    final rows = [
      ('Users', users == null ? '—' : numberFormat.format(users), Icons.people),
      ('Categories', numberFormat.format(categories), Icons.category),
      ('Items', numberFormat.format(items), Icons.fastfood),
      ('Tables', numberFormat.format(tables), Icons.table_restaurant),
      ('Bills', numberFormat.format(bills), Icons.receipt_long),
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'STORE STATISTICS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.gray500,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0) const Divider(height: 1, thickness: 0.6),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: palette.highlight.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(rows[i].$3, size: 15, color: palette.highlight),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      rows[i].$1,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.gray700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    rows[i].$2,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class PaymentMethodsCard extends StatelessWidget {
  final Map<String, double> totals;
  final double grandTotal;

  const PaymentMethodsCard({
    super.key,
    required this.totals,
    required this.grandTotal,
  });

  static const _methods = [
    ('UPI', 'upi', Icons.qr_code_2, Color(0xFF6C3FC0)),
    ('CASH', 'cash', Icons.payments, AppColors.tableAvailable),
    ('CARD', 'card', Icons.credit_card, AppColors.tableReserved),
    ('OTHER', 'other', Icons.more_horiz, AppColors.gray600),
  ];

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final numberFormat = NumberFormat.decimalPattern('en_IN');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PAYMENT METHODS',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.gray500,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
          for (final method in _methods) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: method.$4.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(method.$3, size: 16, color: method.$4),
                      ),
                      const SizedBox(width: 10),
                      Flexible(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            method.$1,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                            maxLines: 1,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerRight,
                              child: Text(
                                '₹${numberFormat.format((totals[method.$2] ?? 0).round())}',
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.dark,
                                  letterSpacing: -0.2,
                                ),
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              '${grandTotal > 0 ? ((totals[method.$2] ?? 0) / grandTotal * 100).toStringAsFixed(1) : '0.0'}%',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.gray600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: grandTotal > 0
                          ? (totals[method.$2] ?? 0) / grandTotal
                          : 0,
                      minHeight: 6,
                      backgroundColor: AppColors.gray200,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(palette.highlight),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class RecentBillsCard extends StatelessWidget {
  final List<Bill> bills;

  const RecentBillsCard({super.key, required this.bills});

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final dateFormat = DateFormat('MMM dd, HH:mm');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: bills.isEmpty
          ? const Padding(
              padding: EdgeInsets.all(28),
              child: Center(
                child: Text(
                  'No bills in this period',
                  style: TextStyle(color: AppColors.gray500),
                ),
              ),
            )
          : ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              itemCount: bills.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, indent: 14, endIndent: 14),
              itemBuilder: (context, index) {
                final bill = bills[index];
                return Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.tableAvailable.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.receipt_long,
                            size: 20, color: AppColors.tableAvailable),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              bill.invoiceNo ?? 'Bill',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.dark,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              '${bill.tableNumber == 0 ? 'Parcel' : 'Table ${bill.tableNumber}'} • ${dateFormat.format(bill.generatedAt)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.gray600,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '₹${bill.total.toStringAsFixed(0)}',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: palette.highlight,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.tableAvailable.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Completed',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.tableAvailable,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
