import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../models/statistics.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/period_filter.dart';
import '../widgets/store_picker_button.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        context.read<DataProvider>().loadStoreData(auth.currentStore!.id);
      }
    });
  }

  List<SalesData> _getFilteredSales(DataProvider data) {
    return data.dailySales;
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final sales = _getFilteredSales(data);
    final itemSales = data.salesByItem.take(10).toList();

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: AppColors.background,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.light,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: AppColors.cardShadow,
                      ),
                      child: const Icon(Icons.assessment_rounded,
                          color: AppColors.primary, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Reports',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const Spacer(),
                    const StorePickerButton(),
                  ],
                ),
              ),
            ),
          ),
          PeriodFilterBar(
            selected: data.periodFilter,
            onChanged: (p) => data.setPeriodFilter(p),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FadeSlideIn(child: _sectionTitle('Revenue Trend')),
                  const SizedBox(height: 14),
                  if (sales.isEmpty)
                    _emptyCard('No data for selected period')
                  else
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 50),
                      child: _chartCard(
                        height: 260,
                        child: LineChart(
                          LineChartData(
                            gridData: FlGridData(
                              show: true,
                              drawVerticalLine: false,
                              horizontalInterval: _calcYInterval(sales),
                              getDrawingHorizontalLine: (value) => FlLine(
                                color: AppColors.gray200,
                                strokeWidth: 1,
                              ),
                            ),
                            titlesData: FlTitlesData(
                              leftTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  reservedSize: 50,
                                  getTitlesWidget: (value, meta) {
                                    return Text(
                                      '\u20B9${value.toInt()}',
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.gray500),
                                    );
                                  },
                                ),
                              ),
                              topTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              rightTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  interval: (sales.length / 6)
                                      .ceil()
                                      .toDouble()
                                      .clamp(1, double.infinity),
                                  getTitlesWidget: (value, meta) {
                                    final idx = value.toInt();
                                    if (idx < 0 || idx >= sales.length) {
                                      return const SizedBox();
                                    }
                                    return Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        DateFormat('MM/dd')
                                            .format(sales[idx].date),
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: AppColors.gray500),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),
                            borderData: FlBorderData(show: false),
                            lineBarsData: [
                              LineChartBarData(
                                spots: sales.asMap().entries.map((e) {
                                  return FlSpot(
                                      e.key.toDouble(), e.value.amount);
                                }).toList(),
                                isCurved: true,
                                color: AppColors.primary,
                                barWidth: 3,
                                dotData: const FlDotData(show: false),
                                belowBarData: BarAreaData(
                                  show: true,
                                  gradient: LinearGradient(
                                    colors: [
                                      AppColors.primary.withValues(alpha: 0.2),
                                      AppColors.primary.withValues(alpha: 0.0),
                                    ],
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  FadeSlideIn(
                      delay: const Duration(milliseconds: 100),
                      child: _sectionTitle('Orders Per Day')),
                  const SizedBox(height: 14),
                  if (sales.isEmpty)
                    _emptyCard('No data for selected period')
                  else
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 150),
                      child: _chartCard(
                        height: 200,
                        child: BarChart(
                          BarChartData(
                            gridData: const FlGridData(show: false),
                            titlesData: FlTitlesData(
                              leftTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              topTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              rightTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  interval: (sales.length / 6)
                                      .ceil()
                                      .toDouble()
                                      .clamp(1, double.infinity),
                                  getTitlesWidget: (value, meta) {
                                    final idx = value.toInt();
                                    if (idx < 0 || idx >= sales.length) {
                                      return const SizedBox();
                                    }
                                    return Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        DateFormat('MM/dd')
                                            .format(sales[idx].date),
                                        style: const TextStyle(
                                            fontSize: 10,
                                            color: AppColors.gray500),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),
                            borderData: FlBorderData(show: false),
                            barGroups: sales.asMap().entries.map((e) {
                              return BarChartGroupData(
                                x: e.key,
                                barRods: [
                                  BarChartRodData(
                                    toY: e.value.orderCount.toDouble(),
                                    gradient: AppColors.infoGradient,
                                    width: 14,
                                    borderRadius: const BorderRadius.only(
                                      topLeft: Radius.circular(6),
                                      topRight: Radius.circular(6),
                                    ),
                                  ),
                                ],
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  FadeSlideIn(
                      delay: const Duration(milliseconds: 200),
                      child: _sectionTitle('Top 10 Items by Revenue')),
                  const SizedBox(height: 14),
                  if (itemSales.isEmpty)
                    _emptyCard('No sales data available')
                  else
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 250),
                      child: _chartCard(
                        height: 320,
                        child: BarChart(
                          BarChartData(
                            gridData: const FlGridData(show: false),
                            titlesData: FlTitlesData(
                              leftTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              topTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              rightTitles: const AxisTitles(
                                  sideTitles: SideTitles(showTitles: false)),
                              bottomTitles: AxisTitles(
                                sideTitles: SideTitles(
                                  showTitles: true,
                                  reservedSize: 60,
                                  getTitlesWidget: (value, meta) {
                                    final idx = value.toInt();
                                    if (idx < 0 ||
                                        idx >= itemSales.length) {
                                      return const SizedBox();
                                    }
                                    final name = itemSales[idx].itemName;
                                    final display = name.length > 12
                                        ? '${name.substring(0, 11)}..'
                                        : name;
                                    return Transform.rotate(
                                      angle: -0.6,
                                      child: Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(
                                          display,
                                          style: const TextStyle(
                                              fontSize: 9,
                                              color: AppColors.gray500),
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),
                            borderData: FlBorderData(show: false),
                            barTouchData: BarTouchData(
                              touchTooltipData: BarTouchTooltipData(
                                getTooltipItem:
                                    (group, groupIndex, rod, rodIndex) {
                                  final item = itemSales[groupIndex];
                                  return BarTooltipItem(
                                    '${item.itemName}\n'
                                    '\u20B9${item.revenue.toStringAsFixed(2)}',
                                    const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12,
                                    ),
                                  );
                                },
                              ),
                            ),
                            barGroups: itemSales.asMap().entries.map((e) {
                              return BarChartGroupData(
                                x: e.key,
                                barRods: [
                                  BarChartRodData(
                                    toY: e.value.revenue,
                                    gradient: AppColors.successGradient,
                                    width: 18,
                                    borderRadius: const BorderRadius.only(
                                      topLeft: Radius.circular(6),
                                      topRight: Radius.circular(6),
                                    ),
                                  ),
                                ],
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  FadeSlideIn(
                      delay: const Duration(milliseconds: 300),
                      child: _sectionTitle('Summary Report')),
                  const SizedBox(height: 14),
                  FadeSlideIn(
                    delay: const Duration(milliseconds: 350),
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.light,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: AppColors.cardShadow,
                      ),
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        children: [
                          _buildReportRow('Period', data.periodFilter.label),
                          _divider(),
                          _buildReportRow('Total Revenue',
                              '\u20B9${data.totalRevenue.toStringAsFixed(2)}'),
                          _divider(),
                          _buildReportRow('Total Tax',
                              '\u20B9${data.totalTax.toStringAsFixed(2)}'),
                          _divider(),
                          _buildReportRow('Total Discount',
                              '\u20B9${data.totalDiscount.toStringAsFixed(2)}'),
                          _divider(),
                          _buildReportRow(
                              'Net Revenue',
                              '\u20B9${(data.totalRevenue - data.totalDiscount).toStringAsFixed(2)}'),
                          _divider(),
                          _buildReportRow('Completed Orders',
                              '${data.completedOrders.length}'),
                          _divider(),
                          _buildReportRow('Cancelled Orders',
                              '${data.cancelledOrders.length}'),
                          _divider(),
                          _buildReportRow('Avg Order Value',
                              '\u20B9${data.avgOrderValue.toStringAsFixed(2)}'),
                          _divider(),
                          _buildReportRow('Total Bills', '${data.bills.length}'),
                          _divider(),
                          _buildReportRow(
                              'Total Items Sold',
                              '${data.salesByItem.fold(0, (sum, i) => sum + i.quantity)}'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chartCard({required double height, required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: const EdgeInsets.all(20),
      child: SizedBox(height: height, child: child),
    );
  }

  Widget _divider() => const Divider(height: 24);

  double _calcYInterval(List<SalesData> sales) {
    if (sales.isEmpty) return 100;
    final maxAmount = sales.fold<double>(
        0, (max, s) => s.amount > max ? s.amount : max);
    if (maxAmount <= 0) return 100;
    final interval = maxAmount / 4;
    if (interval < 1) return 1;
    if (interval < 10) return 10;
    if (interval < 100) return 100;
    if (interval < 1000) return 1000;
    return (interval / 1000).ceil() * 1000.0;
  }

  Widget _buildPeriodChip(String label, String value) {
    return const SizedBox.shrink();
  }

  Widget _buildReportRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style:
                  const TextStyle(fontSize: 14, color: AppColors.gray700)),
          Text(value,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.dark)),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Text(
      title.toUpperCase(),
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: AppColors.gray500,
        letterSpacing: 1,
      ),
    );
  }

  Widget _emptyCard(String message) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: const EdgeInsets.all(40),
      child: Center(
        child: Text(message, style: TextStyle(color: AppColors.gray500)),
      ),
    );
  }
}
