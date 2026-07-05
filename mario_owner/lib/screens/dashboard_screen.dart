import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/period_filter.dart';
import '../widgets/store_picker_button.dart';
import 'store_revenue_screen.dart';

class DashboardScreen extends StatefulWidget {
  final ValueChanged<int>? onTabChange;

  const DashboardScreen({super.key, this.onTabChange});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _isLoadingAllStores = false;
  List<StoreSummary> _storeSummaries = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
      _loadAllStores();
    });
  }

  Future<void> _loadData() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();
    if (auth.currentStore != null) {
      await data.loadStoreData(auth.currentStore!.id);
    }
  }

  Future<void> _loadAllStores() async {
    final auth = context.read<AuthProvider>();
    if (auth.user?.stores == null || auth.user!.stores!.isEmpty) return;

    setState(() => _isLoadingAllStores = true);

    final data = context.read<DataProvider>();
    try {
      _storeSummaries = await data.loadAllStoresSummary(auth);
    } catch (_) {}

    if (mounted) setState(() => _isLoadingAllStores = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadData();
          await _loadAllStores();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar(
              pinned: true,
              automaticallyImplyLeading: false,
              backgroundColor: AppColors.background,
              toolbarHeight: 68,
              title: Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
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
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Image.asset(
                          'assets/images/spash.png',
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Dashboard',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: AppColors.dark,
                              letterSpacing: -0.5,
                            ),
                          ),
                          if (auth.currentStore != null)
                            _buildHeaderStoreSelector(auth),
                        ],
                      ),
                    ),
                    StorePickerButton(
                      onStoreChanged: () {
                        _loadData();
                        _loadAllStores();
                      },
                    ),
                  ],
                ),
              ),
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(44),
                child: Container(
                  color: AppColors.background,
                  child: PeriodFilterBar(
                    selected: data.periodFilter,
                    onChanged: (p) => data.setPeriodFilter(p),
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FadeSlideIn(
                      child: Text(
                        'OVERVIEW',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.gray500,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 50),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          gradient: AppColors.darkGradient,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "Today's Revenue",
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.white.withValues(alpha: 0.6),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '\u20B9${data.todayRevenue.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 40,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                letterSpacing: -1,
                              ),
                            ),
                            const SizedBox(height: 20),
                            Row(
                              children: [
                                _buildDarkStatChip(
                                  'Orders',
                                  '${data.todayOrderCount}',
                                  Icons.receipt_rounded,
                                ),
                                const SizedBox(width: 12),
                                _buildDarkStatChip(
                                  'Active',
                                  '${data.activeOrders.length}',
                                  Icons.hourglass_top_rounded,
                                ),
                                const SizedBox(width: 12),
                                _buildDarkStatChip(
                                  'Avg',
                                  '\u20B9${data.avgOrderValue.toStringAsFixed(0)}',
                                  Icons.trending_up_rounded,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
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
                          '\u20B9${data.totalRevenue.toStringAsFixed(0)}',
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
                          'Parcel Orders',
                          '${data.parcelOrders.length}',
                          Icons.shopping_bag_rounded,
                          AppColors.info,
                        ),
                        _buildLightStatCard(
                          'Total Bills',
                          '${data.bills.length}',
                          Icons.receipt_long_rounded,
                          AppColors.warning,
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 300),
                      child: Text(
                        'ALL STORES OVERVIEW',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.gray500,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (_isLoadingAllStores)
                      Column(
                        children: List.generate(3, (i) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ShimmerBox(
                            width: double.infinity,
                            height: 72,
                            borderRadius: BorderRadius.circular(20),
                          ),
                        )),
                      )
                    else if (_storeSummaries.isEmpty)
                      GlassCard(
                        padding: const EdgeInsets.all(32),
                        child: Center(
                          child: Text(
                            'No stores available',
                            style: TextStyle(color: AppColors.gray500),
                          ),
                        ),
                      )
                    else ...[
                      ..._storeSummaries.take(5).toList().asMap().entries.map((entry) {
                        return StaggeredAnimation(
                          index: entry.key,
                          child: _buildStoreSummaryCard(entry.value, auth),
                        );
                      }),
                      Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: GestureDetector(
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => StoreRevenueScreen(onTabChange: widget.onTabChange),
                                ),
                              );
                            },
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              decoration: BoxDecoration(
                                color: AppColors.primaryExtraLight,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'Show All (${_storeSummaries.length})',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  const Icon(
                                    Icons.arrow_forward_rounded,
                                    size: 18,
                                    color: AppColors.primary,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                    const SizedBox(height: 28),
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 400),
                      child: Text(
                        'QUICK STATS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.gray500,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    FadeSlideIn(
                      delay: const Duration(milliseconds: 450),
                      child: GlassCard(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          children: [
                            _buildStatRow('Total Revenue', '\u20B9${data.totalRevenue.toStringAsFixed(2)}', Icons.currency_rupee_rounded, AppColors.success),
                            _divider(),
                            _buildStatRow('Total Parcel Orders', '${data.parcelOrders.length}', Icons.shopping_bag_rounded, AppColors.info),
                            _divider(),
                            _buildStatRow('Total Discounts', '\u20B9${data.totalDiscount.toStringAsFixed(2)}', Icons.local_offer_rounded, AppColors.warning),
                            _divider(),
                            _buildStatRow('Completed Orders', '${data.completedOrders.length}', Icons.check_circle_rounded, AppColors.success),
                            _divider(),
                            _buildStatRow('Active Orders', '${data.activeOrders.length}', Icons.hourglass_top_rounded, AppColors.warning),
                            _divider(),
                            _buildStatRow('Cancelled Orders', '${data.cancelledOrders.length}', Icons.cancel_rounded, AppColors.danger),
                            _divider(),
                            _buildStatRow('Total Bills', '${data.bills.length}', Icons.receipt_long_rounded, AppColors.primary),
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
      ),
    );
  }

  Widget _divider() => const Divider(height: 24);

  Widget _buildHeaderStoreSelector(AuthProvider auth) {
    final stores = auth.user?.stores ?? [];
    if (stores.length <= 1) {
      return Text(
        auth.currentStore!.displayName,
        style: const TextStyle(
          fontSize: 13,
          color: AppColors.gray500,
        ),
      );
    }

    return GestureDetector(
      onTap: () => _showStorePicker(context, auth, stores),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.store_rounded,
              size: 14, color: AppColors.gray500),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              auth.currentStore?.displayName ?? 'Select Store',
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.gray500,
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 4),
          Icon(Icons.keyboard_arrow_down_rounded,
              size: 16, color: AppColors.gray500),
        ],
      ),
    );
  }

  void _showStorePicker(BuildContext context, AuthProvider auth, List<Store> stores) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.light,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(28),
              topRight: Radius.circular(28),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Select Store',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 16),
              ...stores.map((s) {
                final isCurrent = auth.currentStore?.id == s.id;
                return ListTile(
                  leading: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: isCurrent ? AppColors.primaryGradient : null,
                      color: isCurrent ? null : AppColors.gray100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      isCurrent ? Icons.check_circle_rounded : Icons.store_outlined,
                      color: isCurrent ? Colors.white : AppColors.gray400,
                      size: 22,
                    ),
                  ),
                  title: Text(s.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  subtitle: Text(
                    s.isActive ? 'Active' : 'Inactive',
                    style: TextStyle(
                      fontSize: 12,
                      color: s.isActive ? AppColors.success : AppColors.danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  trailing: isCurrent
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryExtraLight,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Current',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        )
                      : null,
                  onTap: isCurrent
                      ? null
                      : () async {
                          Navigator.pop(ctx);
                          await auth.switchStore(s);
                          await _loadData();
                        },
                );
              }),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStoreSummaryCard(StoreSummary summary, AuthProvider auth) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () async {
            final store = auth.user?.stores?.where((s) => s.id == summary.storeId).first;
            if (store != null) {
              await auth.switchStore(store);
              await _loadData();
            }
          },
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
                  child: const Icon(Icons.store_rounded, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        summary.storeName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${summary.completedOrders} completed \u2022 ${summary.activeOrders} active \u2022 ${summary.totalOrders} total',
                        style: const TextStyle(fontSize: 12, color: AppColors.gray500),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '\u20B9${summary.totalRevenue.toStringAsFixed(0)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.success,
                        fontSize: 18,
                      ),
                    ),
                    const Text(
                      'Revenue',
                      style: TextStyle(fontSize: 10, color: AppColors.gray400),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDarkStatChip(String label, String value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: Colors.white.withValues(alpha: 0.6), size: 16),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
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

  Widget _buildStatRow(String label, String value, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(label, style: const TextStyle(fontSize: 14, color: AppColors.gray700)),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.dark,
            ),
          ),
        ],
      ),
    );
  }
}
