import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../models/bill.dart';
import '../models/statistics.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

enum _StatsPeriod { today, week, month, custom }

class StatisticsScreen extends StatefulWidget {
  const StatisticsScreen({super.key, this.isActive = false});

  // Whether this tab is currently visible inside HomeScreen's IndexedStack.
  // Data is fetched lazily the first time the tab becomes active.
  final bool isActive;

  @override
  State<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends State<StatisticsScreen> {
  bool _isLoading = true;
  _StatsPeriod _period = _StatsPeriod.today;
  DateTimeRange? _customRange;

  // Buckets for the revenue charts: one amount per slot plus a sparse label.
  List<double> _buckets = [];
  List<String> _bucketLabels = [];

  @override
  void didUpdateWidget(StatisticsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      _loadStats();
    }
  }

  /// The currently selected reporting window.
  ({DateTime start, DateTime end}) _window() {
    final now = DateTime.now();
    switch (_period) {
      case _StatsPeriod.today:
        return (start: DateTime(now.year, now.month, now.day), end: now);
      case _StatsPeriod.week:
        final start = DateTime(now.year, now.month, now.day)
            .subtract(Duration(days: now.weekday - 1));
        return (start: start, end: now);
      case _StatsPeriod.month:
        return (start: DateTime(now.year, now.month), end: now);
      case _StatsPeriod.custom:
        final r = _customRange!;
        return (
          start: DateTime(r.start.year, r.start.month, r.start.day),
          end: DateTime(r.end.year, r.end.month, r.end.day, 23, 59, 59),
        );
    }
  }

  DateTime get _prevStart {
    final w = _window();
    return w.start.subtract(w.end.difference(w.start));
  }

  String get _rangeLabel {
    final w = _window();
    switch (_period) {
      case _StatsPeriod.today:
        return 'Today · ${DateFormat('MMM dd, yyyy').format(w.start)}';
      case _StatsPeriod.week:
        return 'This Week · ${DateFormat('MMM d').format(w.start)} – ${DateFormat('MMM d').format(w.end)}';
      case _StatsPeriod.month:
        return DateFormat('MMMM yyyy').format(w.start);
      case _StatsPeriod.custom:
        return '${DateFormat('MMM d').format(w.start)} – ${DateFormat('MMM d, yyyy').format(w.end)}';
    }
  }

  String get _compareLabel {
    switch (_period) {
      case _StatsPeriod.today:
        return 'Compared to yesterday';
      case _StatsPeriod.week:
        return 'Compared to last week';
      case _StatsPeriod.month:
        return 'Compared to last month';
      case _StatsPeriod.custom:
        return 'Compared to previous period';
    }
  }

  Future<void> _loadStats() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();
    if (auth.currentStore != null) {
      final w = _window();
      await Future.wait([
        data.loadStats(),
        data.loadBills(auth.currentStore!.id, from: _prevStart, to: w.end),
        data.loadHistoryOrders(auth.currentStore!.id,
            from: _prevStart, to: w.end),
      ]);
    } else {
      await data.loadStats();
    }
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _pickCustomRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _customRange,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: AppColors.primary,
                  onPrimary: Colors.white,
                  onSurface: AppColors.dark,
                ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() {
        _customRange = picked;
        _period = _StatsPeriod.custom;
        _isLoading = true;
      });
      await _loadStats();
    }
  }

  void _setPeriod(_StatsPeriod period) {
    if (_period == period) return;
    setState(() {
      _period = period;
      _isLoading = true;
    });
    _loadStats();
  }

  /// Builds revenue buckets for the selected window.
  void _buildBuckets(List<Bill> bills) {
    final w = _window();
    final int slots;
    final int Function(DateTime) slotOf;
    switch (_period) {
      case _StatsPeriod.today:
        slots = 24;
        slotOf = (t) => t.hour;
        break;
      case _StatsPeriod.week:
        slots = 7;
        slotOf = (t) => t.weekday - 1;
        break;
      case _StatsPeriod.month:
        slots = DateTime(w.start.year, w.start.month + 1, 0).day;
        slotOf = (t) => t.day - 1;
        break;
      case _StatsPeriod.custom:
        slots = w.end.difference(w.start).inDays + 1;
        slotOf = (t) => DateTime(t.year, t.month, t.day)
            .difference(w.start)
            .inDays;
        break;
    }

    final buckets = List<double>.filled(slots, 0);
    for (final bill in bills) {
      final idx = slotOf(bill.generatedAt.toLocal());
      if (idx >= 0 && idx < slots) {
        buckets[idx] += bill.total;
      }
    }

    _buckets = buckets;
    _bucketLabels = List<String>.filled(slots, '');
    switch (_period) {
      case _StatsPeriod.today:
        const marks = {6: '6 AM', 9: '9 AM', 12: '12 PM', 15: '3 PM', 18: '6 PM', 21: '9 PM'};
        marks.forEach((i, label) {
          if (i < slots) _bucketLabels[i] = label;
        });
        break;
      case _StatsPeriod.week:
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        for (var i = 0; i < slots && i < days.length; i++) {
          _bucketLabels[i] = days[i];
        }
        break;
      case _StatsPeriod.month:
      case _StatsPeriod.custom:
        for (var i = 0; i < slots; i += 5) {
          _bucketLabels[i] = '${i + 1}';
        }
        break;
    }
  }

  String _hourLabel(int slot) {
    switch (_period) {
      case _StatsPeriod.today:
        final h = slot % 12 == 0 ? 12 : slot % 12;
        return slot < 12 ? '$h AM' : '$h PM';
      case _StatsPeriod.week:
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return slot < days.length ? days[slot] : '';
      case _StatsPeriod.month:
      case _StatsPeriod.custom:
        return '${slot + 1}';
    }
  }

  static double _pctChange(double current, double previous) {
    if (previous <= 0) return 0;
    return (current - previous) / previous * 100;
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final stats = data.stats;
    final w = _window();

    final currentBills = data.bills
        .where((b) => !b.generatedAt.isBefore(w.start))
        .toList();
    final prevBills = data.bills
        .where((b) => b.generatedAt.isBefore(w.start))
        .toList();
    final currentOrders = data.historyOrders
        .where((o) => !o.createdAt.isBefore(w.start))
        .toList();
    final prevOrders = data.historyOrders
        .where((o) => o.createdAt.isBefore(w.start))
        .toList();

    final totalRevenue =
        currentBills.fold<double>(0, (sum, bill) => sum + bill.total);
    final prevRevenue =
        prevBills.fold<double>(0, (sum, bill) => sum + bill.total);
    final revenuePct = _pctChange(totalRevenue, prevRevenue);

    final completedOrders = currentOrders.where((o) => o.isCompleted).length;
    final prevCompleted = prevOrders.where((o) => o.isCompleted).length;
    final cancelledOrders = currentOrders.where((o) => o.isCancelled).length;
    final prevCancelled = prevOrders.where((o) => o.isCancelled).length;
    final activeOrders = data.activeOrders.length;
    final prevActive = prevOrders.where((o) => o.isActive).length;

    _buildBuckets(currentBills);

    final paymentTotals = _paymentTotals(currentBills);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Statistics',
      ),
      body: _isLoading || stats == null
          ? Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : RefreshIndicator(
              onRefresh: _loadStats,
              color: AppColors.primary,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildPeriodSelector(),
                    const SizedBox(height: 14),
                    _buildRevenueCard(totalRevenue, revenuePct, prevRevenue),
                    const SizedBox(height: 14),
                    _buildStatCardsRow(
                      totalOrders: currentOrders.length,
                      prevTotalOrders: prevOrders.length,
                      completed: completedOrders,
                      prevCompleted: prevCompleted,
                      active: activeOrders,
                      prevActive: prevActive,
                      cancelled: cancelledOrders,
                      prevCancelled: prevCancelled,
                    ),
                    const SizedBox(height: 14),
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            flex: 11,
                            child: _buildSalesOverviewCard(),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 10,
                            child: _buildSystemStatsCard(stats),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    _buildPaymentMethodsCard(paymentTotals, totalRevenue),
                    const SizedBox(height: 14),
                    _buildRecentBillsCard(currentBills),
                  ],
                ),
              ),
            ),
    );
  }

  // ---------------------------------------------------------------- selectors

  Widget _buildPeriodSelector() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          GestureDetector(
            onTap: _pickCustomRange,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _period == _StatsPeriod.custom
                      ? AppColors.primary
                      : AppColors.gray300,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.gray500.withOpacity(0.08),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 15, color: AppColors.gray600),
                  const SizedBox(width: 8),
                  Text(
                    _rangeLabel,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.gray700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.keyboard_arrow_down,
                      size: 16, color: AppColors.gray500),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          _periodPill('Today', _StatsPeriod.today),
          const SizedBox(width: 8),
          _periodPill('This Week', _StatsPeriod.week),
          const SizedBox(width: 8),
          _periodPill('This Month', _StatsPeriod.month),
        ],
      ),
    );
  }

  Widget _periodPill(String label, _StatsPeriod period) {
    final selected = _period == period;
    return GestureDetector(
      onTap: () => _setPeriod(period),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray300,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : [
                  BoxShadow(
                    color: AppColors.gray500.withOpacity(0.08),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.gray600,
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------- cards

  Widget _buildRevenueCard(
      double revenue, double pct, double prevRevenue) {
    final maxY = _buckets.fold<double>(
        0, (m, v) => v > m ? v : m);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.35),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Total Revenue',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.white.withOpacity(0.85),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.bar_chart,
                    color: Colors.white, size: 18),
              ),
            ],
          ),
          Row(
            children: [
              Text(
                '₹${NumberFormat('#,##,###').format(revenue.round())}',
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      pct >= 0 ? Icons.trending_up : Icons.trending_down,
                      size: 14,
                      color: pct >= 0 ? AppColors.success : AppColors.danger,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(0)}%',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color:
                            pct >= 0 ? AppColors.success : AppColors.danger,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.18),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.bar_chart,
                        color: Colors.white, size: 16),
                    const SizedBox(height: 6),
                    Text(
                      _compareLabel,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.white.withOpacity(0.85),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '₹${NumberFormat('#,##,###').format(prevRevenue.round())}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 84,
                  child: Column(
                    children: [
                      Expanded(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (var i = 0; i < _buckets.length; i++)
                              Expanded(
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(horizontal: 1),
                                  child: Align(
                                    alignment: Alignment.bottomCenter,
                                    child: Container(
                                      height: maxY > 0
                                          ? (8 +
                                              56 * (_buckets[i] / maxY))
                                          : 8,
                                      decoration: BoxDecoration(
                                        color:
                                            Colors.white.withOpacity(0.9),
                                        borderRadius:
                                            BorderRadius.circular(3),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          return SizedBox(
                            height: 12,
                            child: Stack(
                              children: [
                                for (var i = 0; i < _buckets.length; i++)
                                  if (_bucketLabels[i].isNotEmpty)
                                    Positioned(
                                      left: (i + 0.5) /
                                              _buckets.length *
                                              constraints.maxWidth -
                                          18,
                                      width: 40,
                                      child: Text(
                                        _bucketLabels[i],
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontSize: 8.5,
                                          color: Colors.white
                                              .withOpacity(0.85),
                                        ),
                                      ),
                                    ),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatCardsRow({
    required int totalOrders,
    required int prevTotalOrders,
    required int completed,
    required int prevCompleted,
    required int active,
    required int prevActive,
    required int cancelled,
    required int prevCancelled,
  }) {
    return Row(
      children: [
        _miniStatCard(
          icon: Icons.receipt_long,
          iconColor: AppColors.primary,
          iconBg: AppColors.primarySoft,
          value: '$totalOrders',
          label: 'Total Orders',
          pct: _pctChange(
              totalOrders.toDouble(), prevTotalOrders.toDouble()),
        ),
        const SizedBox(width: 8),
        _miniStatCard(
          icon: Icons.check_circle,
          iconColor: AppColors.success,
          iconBg: AppColors.success.withOpacity(0.12),
          value: '$completed',
          label: 'Completed',
          pct: _pctChange(
              completed.toDouble(), prevCompleted.toDouble()),
        ),
        const SizedBox(width: 8),
        _miniStatCard(
          icon: Icons.hourglass_top,
          iconColor: AppColors.info,
          iconBg: AppColors.info.withOpacity(0.12),
          value: '$active',
          label: 'Active',
          pct: _pctChange(active.toDouble(), prevActive.toDouble()),
        ),
        const SizedBox(width: 8),
        _miniStatCard(
          icon: Icons.cancel,
          iconColor: AppColors.danger,
          iconBg: AppColors.danger.withOpacity(0.1),
          value: '$cancelled',
          label: 'Cancelled',
          pct: _pctChange(
              cancelled.toDouble(), prevCancelled.toDouble()),
        ),
      ],
    );
  }

  Widget _miniStatCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String value,
    required String label,
    required double pct,
  }) {
    final Color pctColor = pct > 0
        ? AppColors.success
        : pct < 0
            ? AppColors.danger
            : AppColors.gray500;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: AppColors.gray500.withOpacity(0.12),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 15, color: iconColor),
                ),
                const SizedBox(width: 8),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: AppColors.gray500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: pctColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    pct == 0
                        ? Icons.remove
                        : pct > 0
                            ? Icons.trending_up
                            : Icons.trending_down,
                    size: 11,
                    color: pctColor,
                  ),
                  const SizedBox(width: 2),
                  Text(
                    '${pct > 0 ? '+' : ''}${pct.toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      color: pctColor,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSalesOverviewCard() {
    final maxY =
        _buckets.fold<double>(0, (m, v) => v > m ? v : m);
    final chartMax = maxY <= 0 ? 100.0 : maxY * 1.15;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.gray500.withOpacity(0.12),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Expanded(
                child: Text(
                  'Sales Overview',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
              ),
              Icon(Icons.chevron_right,
                  size: 18, color: AppColors.gray400),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: BarChart(
              BarChartData(
                maxY: chartMax,
                alignment: BarChartAlignment.spaceAround,
                gridData: const FlGridData(show: false),
                borderData: FlBorderData(show: false),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    // ignore: deprecated_member_use
                    tooltipBgColor: AppColors.dark,
                    tooltipPadding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    getTooltipItem:
                        (group, groupIndex, rod, rodIndex) {
                      return BarTooltipItem(
                        '₹${NumberFormat('#,##,###').format(rod.toY.round())}\n${_hourLabel(group.x)}',
                        const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                        ),
                      );
                    },
                  ),
                ),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(),
                  rightTitles: const AxisTitles(),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 26,
                      interval: chartMax / 4,
                      getTitlesWidget: (value, meta) {
                        if (value == meta.max) {
                          return const SizedBox.shrink();
                        }
                        return Text(
                          value >= 1000
                              ? '${(value / 1000).toStringAsFixed(value % 1000 == 0 ? 0 : 1)}K'
                              : value.toStringAsFixed(0),
                          style: const TextStyle(
                            fontSize: 8.5,
                            color: AppColors.gray500,
                          ),
                        );
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 14,
                      getTitlesWidget: (value, meta) {
                        final i = value.toInt();
                        if (i < 0 || i >= _bucketLabels.length) {
                          return const SizedBox.shrink();
                        }
                        if (_bucketLabels[i].isEmpty) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 3),
                          child: Text(
                            _bucketLabels[i],
                            style: const TextStyle(
                              fontSize: 8.5,
                              color: AppColors.gray500,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < _buckets.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: _buckets[i],
                          color: AppColors.primaryLight,
                          width: _buckets.length > 20 ? 4 : 7,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(3)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSystemStatsCard(SystemStats stats) {
    final rows = [
      (Icons.group_outlined, 'Users', stats.users),
      (Icons.category_outlined, 'Categories', stats.categories),
      (Icons.fastfood_outlined, 'Items', stats.items),
      (Icons.table_restaurant_outlined, 'Tables', stats.tables),
      (Icons.receipt_long, 'Bills', stats.bills),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.gray500.withOpacity(0.12),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Expanded(
                child: Text(
                  'System Statistics',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
              ),
              Icon(Icons.chevron_right,
                  size: 18, color: AppColors.gray400),
            ],
          ),
          const SizedBox(height: 8),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: AppColors.gray200,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child:
                        Icon(row.$1, size: 15, color: AppColors.gray600),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      row.$2,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppColors.gray700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    '${row.$3}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right,
                      size: 16, color: AppColors.gray400),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Map<String, double> _paymentTotals(List<Bill> bills) {
    final totals = <String, double>{
      'UPI': 0,
      'Cash': 0,
      'Card': 0,
      'Others': 0,
    };
    for (final bill in bills) {
      switch ((bill.paymentMethod ?? '').toLowerCase()) {
        case 'upi':
          totals['UPI'] = totals['UPI']! + bill.total;
          break;
        case 'cash':
          totals['Cash'] = totals['Cash']! + bill.total;
          break;
        case 'card':
          totals['Card'] = totals['Card']! + bill.total;
          break;
        default:
          totals['Others'] = totals['Others']! + bill.total;
      }
    }
    return totals;
  }

  Widget _buildPaymentMethodsCard(
      Map<String, double> paymentTotals, double totalRevenue) {
    final methodColors = <String, Color>{
      'UPI': AppColors.primary,
      'Cash': AppColors.primaryLight,
      'Card': AppColors.clayPeach,
      'Others': AppColors.gray300,
    };
    final grandTotal = paymentTotals.values
        .fold<double>(0, (sum, v) => sum + v);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.gray500.withOpacity(0.12),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Payment Methods',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: AppColors.dark,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              SizedBox(
                width: 110,
                height: 110,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    PieChart(
                      PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 34,
                        sections: [
                          for (final entry in paymentTotals.entries)
                            PieChartSectionData(
                              value: entry.value <= 0
                                  ? 0.001
                                  : entry.value,
                              color: methodColors[entry.key],
                              radius: 16,
                              showTitle: false,
                            ),
                        ],
                      ),
                    ),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '₹${NumberFormat('#,##,###').format(totalRevenue.round())}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        const Text(
                          'Total',
                          style: TextStyle(
                            fontSize: 10,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(width: 18),
              Expanded(
                child: Column(
                  children: [
                    for (final entry in paymentTotals.entries)
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Container(
                              width: 9,
                              height: 9,
                              decoration: BoxDecoration(
                                color: methodColors[entry.key],
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              entry.key,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.gray700,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              '₹${NumberFormat('#,##,###').format(entry.value.round())} (${grandTotal > 0 ? (entry.value / grandTotal * 100).toStringAsFixed(0) : 0}%)',
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.dark,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRecentBillsCard(List<Bill> bills) {
    final recent = bills.take(6).toList();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.gray500.withOpacity(0.12),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Recent Bills',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
              ),
              Text(
                'View all',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
              Icon(Icons.chevron_right,
                  size: 16, color: AppColors.primary),
            ],
          ),
          const SizedBox(height: 6),
          if (recent.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No bills in this period',
                  style:
                      TextStyle(color: AppColors.gray500, fontSize: 14),
                ),
              ),
            )
          else
            for (final bill in recent)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: AppColors.gray200,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: const Icon(Icons.receipt_long,
                          size: 17, color: AppColors.gray600),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            bill.invoiceNo ?? 'Invoice',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            '${bill.tableLabel} · ${DateFormat('MMM dd, HH:mm').format(bill.generatedAt)}',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.gray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '₹${bill.total.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                    const Icon(Icons.chevron_right,
                        size: 18, color: AppColors.gray400),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}
