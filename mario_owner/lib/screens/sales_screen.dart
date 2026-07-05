import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/period_filter.dart';
import '../widgets/store_picker_button.dart';

class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int? _touchedCategoryIndex;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (mounted && !_tabController.indexIsChanging) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        context.read<DataProvider>().loadStoreData(auth.currentStore!.id);
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: AppColors.background,
            child: SafeArea(
              bottom: false,
              child: Column(
                children: [
                  Padding(
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
                          child: const Icon(Icons.bar_chart_rounded,
                              color: AppColors.primary, size: 24),
                        ),
                        const SizedBox(width: 12),
                        const Text(
                          'Sales Analytics',
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
                  _buildFloatingTabBar(),
                ],
              ),
            ),
          ),
          PeriodFilterBar(
            selected: data.periodFilter,
            onChanged: (p) => data.setPeriodFilter(p),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildOverallTab(data),
                _buildByItemTab(data),
                _buildByCategoryTab(data),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFloatingTabBar() {
    final tabs = ['Overall', 'By Item', 'By Category'];
    final icons = [
      Icons.insights_rounded,
      Icons.restaurant_rounded,
      Icons.category_rounded,
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppColors.gray200, width: 1),
        ),
        child: Row(
          children: List.generate(tabs.length, (index) {
            final isSelected = _tabController.index == index;
            return Expanded(
              child: GestureDetector(
                onTap: () {
                  _tabController.animateTo(index);
                  setState(() {});
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeOutCubic,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    gradient: isSelected ? AppColors.primaryGradient : null,
                    color: isSelected ? null : Colors.transparent,
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: isSelected
                        ? [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.35),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        icons[index],
                        size: 16,
                        color: isSelected
                            ? Colors.white
                            : AppColors.gray500,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        tabs[index],
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected
                              ? Colors.white
                              : AppColors.gray500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget _buildOverallTab(DataProvider data) {
    final dailySales = data.last30DaysSales;
    final paymentMethods = data.paymentMethodBreakdown;
    final totalRevenue = data.totalRevenue;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: ResponsiveHelper.isTablet(context) ? 4 : 2,
            crossAxisSpacing: 14,
            mainAxisSpacing: 14,
            childAspectRatio: 1.4,
            children: [
              _buildLightStatCard(
                'Total Revenue',
                '\u20B9${totalRevenue.toStringAsFixed(0)}',
                Icons.currency_rupee_rounded,
                AppColors.success,
              ),
              _buildLightStatCard(
                'Total Orders',
                '${data.completedOrders.length}',
                Icons.receipt_rounded,
                AppColors.primary,
              ),
              _buildLightStatCard(
                'Avg Order Value',
                '\u20B9${data.avgOrderValue.toStringAsFixed(0)}',
                Icons.trending_up_rounded,
                AppColors.info,
              ),
              _buildLightStatCard(
                'Total Tax',
                '\u20B9${data.totalTax.toStringAsFixed(0)}',
                Icons.percent_rounded,
                AppColors.warning,
              ),
            ],
          ),
          const SizedBox(height: 24),
          FadeSlideIn(
            delay: const Duration(milliseconds: 300),
            child: _sectionTitle('Last 30 Days Revenue'),
          ),
          const SizedBox(height: 14),
          if (dailySales.isEmpty)
            _emptyCard('No sales data available')
          else
            FadeSlideIn(
              delay: const Duration(milliseconds: 350),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.light,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: AppColors.cardShadow,
                ),
                padding: const EdgeInsets.all(20),
                child: SizedBox(
                  height: 220,
                  child: LineChart(
                    LineChartData(
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
                            interval:
                                (dailySales.length / 5).ceil().toDouble(),
                            getTitlesWidget: (value, meta) {
                              final idx = value.toInt();
                              if (idx < 0 || idx >= dailySales.length) {
                                return const SizedBox();
                              }
                              return Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  DateFormat('MM/dd')
                                      .format(dailySales[idx].date),
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
                          spots: dailySales.asMap().entries.map((e) {
                            return FlSpot(e.key.toDouble(), e.value.amount);
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
            ),
          const SizedBox(height: 24),
          if (paymentMethods.isNotEmpty) ...[
            FadeSlideIn(
              delay: const Duration(milliseconds: 400),
              child: _sectionTitle('Payment Methods'),
            ),
            const SizedBox(height: 14),
            FadeSlideIn(
              delay: const Duration(milliseconds: 450),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.light,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: AppColors.cardShadow,
                ),
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: paymentMethods.entries.map((entry) {
                    final percentage = totalRevenue > 0
                        ? (entry.value / totalRevenue * 100)
                        : 0.0;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                entry.key.toUpperCase(),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              Text(
                                '\u20B9${entry.value.toStringAsFixed(0)} (${percentage.toStringAsFixed(1)}%)',
                                style: const TextStyle(
                                    color: AppColors.gray600, fontSize: 13),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          AnimatedProgress(
                            value: percentage / 100,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildByItemTab(DataProvider data) {
    final itemSales = data.salesByItem;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FadeSlideIn(child: _sectionTitle('Top Selling Items')),
          const SizedBox(height: 14),
          if (itemSales.isEmpty)
            _emptyCard('No sales data available')
          else
            ...itemSales.asMap().entries.map((entry) {
              return StaggeredAnimation(
                index: entry.key,
                child: _buildItemSalesCard(entry.value),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildByCategoryTab(DataProvider data) {
    final categorySales = data.salesByCategory;
    final totalRevenue =
        categorySales.fold<double>(0, (sum, c) => sum + c.revenue);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FadeSlideIn(child: _sectionTitle('Sales by Category')),
          const SizedBox(height: 14),
          if (categorySales.isEmpty)
            _emptyCard('No sales data available')
          else ...[
            FadeSlideIn(
              delay: const Duration(milliseconds: 100),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.light,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: AppColors.cardShadow,
                ),
                padding: const EdgeInsets.all(20),
                child: SizedBox(
                  height: 220,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      PieChart(
                        PieChartData(
                          pieTouchData: PieTouchData(
                            touchCallback: (FlTouchEvent event,
                                pieTouchResponse) {
                              setState(() {
                                if (event is FlTapUpEvent) {
                                  final index = pieTouchResponse
                                      ?.touchedSection?.touchedSectionIndex;
                                  if (index != null && index >= 0) {
                                    _touchedCategoryIndex = index;
                                  } else {
                                    _touchedCategoryIndex = null;
                                  }
                                }
                              });
                            },
                          ),
                          sections:
                              categorySales.asMap().entries.map((e) {
                            final colors = [
                              AppColors.primary,
                              AppColors.success,
                              AppColors.warning,
                              AppColors.info,
                              AppColors.danger,
                              AppColors.accent,
                            ];
                            final color = colors[e.key % colors.length];
                            final percentage = totalRevenue > 0
                                ? (e.value.revenue /
                                    totalRevenue *
                                    100)
                                : 0.0;
                            final isTouched =
                                _touchedCategoryIndex == e.key;
                            return PieChartSectionData(
                              color: color,
                              value: e.value.revenue,
                              title:
                                  '${percentage.toStringAsFixed(0)}%',
                              radius: isTouched ? 75 : 65,
                              titleStyle: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            );
                          }).toList(),
                          sectionsSpace: 3,
                          centerSpaceRadius: 45,
                        ),
                      ),
                      if (_touchedCategoryIndex != null &&
                          _touchedCategoryIndex! >= 0 &&
                          _touchedCategoryIndex! < categorySales.length)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.dark.withValues(alpha: 0.9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                categorySales[_touchedCategoryIndex!]
                                    .categoryName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '\u20B9${categorySales[_touchedCategoryIndex!].revenue.toStringAsFixed(0)}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            ...categorySales.asMap().entries.map((entry) {
              return StaggeredAnimation(
                index: entry.key,
                child: _buildCategorySalesCard(entry.value, totalRevenue),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _buildItemSalesCard(ItemSales item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: AppColors.primaryGradient,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.fastfood_rounded, color: Colors.white, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.itemName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text(item.categoryName,
                      style: const TextStyle(fontSize: 12, color: AppColors.gray500)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '\u20B9${item.revenue.toStringAsFixed(0)}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.success,
                    fontSize: 18,
                  ),
                ),
                Text(
                  '${item.quantity} sold',
                  style: const TextStyle(fontSize: 11, color: AppColors.gray400),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategorySalesCard(CategorySales cat, double totalRevenue) {
    final percentage =
        totalRevenue > 0 ? (cat.revenue / totalRevenue * 100) : 0.0;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(cat.categoryName,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 16)),
              Text(
                '\u20B9${cat.revenue.toStringAsFixed(0)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: AppColors.success,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AnimatedProgress(value: percentage / 100, color: AppColors.primary),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${cat.quantity} items sold',
                  style: const TextStyle(fontSize: 12, color: AppColors.gray500)),
              Text('${percentage.toStringAsFixed(1)}%',
                  style: const TextStyle(fontSize: 12, color: AppColors.gray500)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLightStatCard(String title, String value, IconData icon, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.dark,
              letterSpacing: -0.5,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.gray500,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
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
