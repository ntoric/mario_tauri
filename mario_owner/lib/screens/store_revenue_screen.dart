import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/app_bottom_nav.dart';

class StoreRevenueScreen extends StatefulWidget {
  final ValueChanged<int>? onTabChange;

  const StoreRevenueScreen({super.key, this.onTabChange});

  @override
  State<StoreRevenueScreen> createState() => _StoreRevenueScreenState();
}

class _StoreRevenueScreenState extends State<StoreRevenueScreen> {
  bool _isLoading = false;
  List<StoreSummary> _storeSummaries = [];
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  List<StoreSummary> get _filteredSummaries {
    if (_searchQuery.isEmpty) return _storeSummaries;
    final query = _searchQuery.toLowerCase();
    return _storeSummaries
        .where((s) => s.storeName.toLowerCase().contains(query))
        .toList();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAllStores();
    });
  }

  Future<void> _loadAllStores() async {
    final auth = context.read<AuthProvider>();
    if (auth.user?.stores == null || auth.user!.stores!.isEmpty) return;

    setState(() => _isLoading = true);

    final data = context.read<DataProvider>();
    try {
      _storeSummaries = await data.loadAllStoresSummary(auth);
    } catch (_) {}

    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Store Revenue'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _loadAllStores,
        color: AppColors.primary,
        child: _isLoading
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: List.generate(
                  5,
                  (i) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: ShimmerBox(
                      width: double.infinity,
                      height: 72,
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                ),
              )
            : _storeSummaries.isEmpty
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 120),
                      Center(
                        child: Text(
                          'No stores available',
                          style: TextStyle(color: AppColors.gray500, fontSize: 15),
                        ),
                      ),
                    ],
                  )
                : CustomScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    slivers: [
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                        sliver: SliverToBoxAdapter(
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 16),
                            decoration: BoxDecoration(
                              color: AppColors.light,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: AppColors.cardShadow,
                            ),
                            child: TextField(
                              controller: _searchController,
                              onChanged: (value) {
                                setState(() => _searchQuery = value);
                              },
                              decoration: const InputDecoration(
                                hintText: 'Search stores...',
                                prefixIcon: Icon(Icons.search_rounded, color: AppColors.gray400),
                                suffixIcon: null,
                                border: InputBorder.none,
                                enabledBorder: InputBorder.none,
                                focusedBorder: InputBorder.none,
                                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              ),
                            ),
                          ),
                        ),
                      ),
                      if (_filteredSummaries.isEmpty)
                        const SliverToBoxAdapter(
                          child: Padding(
                            padding: EdgeInsets.only(top: 60),
                            child: Center(
                              child: Text(
                                'No stores found',
                                style: TextStyle(color: AppColors.gray500, fontSize: 15),
                              ),
                            ),
                          ),
                        )
                      else
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                          sliver: SliverList(
                            delegate: SliverChildBuilderDelegate(
                              (context, index) {
                                final summary = _filteredSummaries[index];
                                return StaggeredAnimation(
                                  index: index,
                                  child: _buildStoreRevenueCard(summary, auth),
                                );
                              },
                              childCount: _filteredSummaries.length,
                            ),
                          ),
                        ),
                    ],
                  ),
      ),
      bottomNavigationBar: AppBottomNav(
        currentIndex: 0,
        onTap: (index) {
          if (index == 0) {
            Navigator.pop(context);
          } else {
            widget.onTabChange?.call(index);
            Navigator.pop(context);
          }
        },
      ),
    );
  }

  Widget _buildStoreRevenueCard(StoreSummary summary, AuthProvider auth) {
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
              if (mounted) {
                Navigator.pop(context);
              }
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
}
