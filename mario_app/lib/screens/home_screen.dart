import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../providers/auth_provider.dart';
import '../utils/constants.dart';
import 'tables_screen.dart';
import 'orders_screen.dart';
import 'history_screen.dart';
import 'settings_screen.dart';
import 'statistics_screen.dart';
import 'categories_items_screen.dart';
import 'parcel_order_screen.dart';
import 'support_screen.dart';
import '../widgets/animated_gradient_background.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  bool _isCheckingStore = true;
  Timer? _storeStatusCheckTimer;

  @override
  void initState() {
    super.initState();
    _checkStoreStatus();
    _startPeriodicStoreCheck();
  }

  @override
  void dispose() {
    _storeStatusCheckTimer?.cancel();
    super.dispose();
  }

  void _startPeriodicStoreCheck() {
    // Check store status every 30 seconds - refresh user data from server
    _storeStatusCheckTimer =
        Timer.periodic(const Duration(seconds: 30), (_) async {
      final auth = context.read<AuthProvider>();
      await auth.refreshUser();
      _checkStoreStatus();
    });
  }

  Future<void> _checkStoreStatus() async {
    final auth = context.read<AuthProvider>();
    final store = auth.currentStore;
    final user = auth.user;

    // If user is not superadmin and store is inactive, show support page
    if (user?.role != 'superadmin' && store != null && !store.isActive) {
      // Fetch support config
      try {
        final response = await http.get(
          Uri.parse('${auth.backend.api.baseUrl}/support-config'),
        );

        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => SupportScreen(
                  email: data['email'] ?? '',
                  phone: data['phone'] ?? '',
                  whatsappLink: data['whatsappLink'] ?? '',
                  storeName: store.name,
                  storeBranch: store.branch,
                ),
              ),
            );
          }
          return;
        }
      } catch (e) {
        // If support config fetch fails, show support page with empty values
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => SupportScreen(
                email: '',
                phone: '',
                whatsappLink: '',
                storeName: store.name,
                storeBranch: store.branch,
              ),
            ),
          );
        }
        return;
      }
    }

    if (mounted) {
      setState(() {
        _isCheckingStore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isCheckingStore) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: AnimatedGradientBackground(
          child: Center(
            child: SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
                strokeWidth: 3,
              ),
            ),
          ),
        ),
      );
    }
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final canViewStats = auth.canViewStats;

    final screens = [
      const TablesScreen(),
      const OrdersScreen(),
      const HistoryScreen(),
      if (canViewStats) const StatisticsScreen(),
      const CategoriesItemsScreen(),
      ParcelOrderScreen(
        onOrderSuccess: () {
          setState(() => _currentIndex = 2);
        },
      ),
      const SettingsScreen(),
    ];

    final navItems = [
      _NavItem(
          icon: Icons.table_restaurant_outlined,
          activeIcon: Icons.table_restaurant,
          label: 'Tables'),
      _NavItem(
          icon: Icons.receipt_outlined,
          activeIcon: Icons.receipt,
          label: 'Orders'),
      _NavItem(
          icon: Icons.history_outlined,
          activeIcon: Icons.history,
          label: 'History'),
      if (canViewStats)
        _NavItem(
            icon: Icons.bar_chart_outlined,
            activeIcon: Icons.bar_chart,
            label: 'Stats'),
      _NavItem(
          icon: Icons.restaurant_menu_outlined,
          activeIcon: Icons.restaurant_menu,
          label: 'Menu'),
      _NavItem(
          icon: Icons.shopping_bag_outlined,
          activeIcon: Icons.shopping_bag,
          label: 'Parcel'),
      _NavItem(
          icon: Icons.settings_outlined,
          activeIcon: Icons.settings,
          label: 'Settings'),
    ];

    final isTablet = ResponsiveHelper.isTablet(context);
    final isDesktop = ResponsiveHelper.isDesktop(context);

    if (isTablet || isDesktop) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: AnimatedGradientBackground(
          child: Row(
            children: [
              Container(
                width: isDesktop ? 240 : 80,
                margin: const EdgeInsets.fromLTRB(16, 20, 12, 20),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: ClayStyles.surface(
                  radiusValue: 32,
                  border: Border.all(color: Colors.white.withOpacity(0.55)),
                ),
                child: Column(
                  children: [
                    const SizedBox(height: 24),
                    Padding(
                      padding:
                          EdgeInsets.symmetric(horizontal: isDesktop ? 20 : 16),
                      child: Row(
                        mainAxisAlignment: isDesktop
                            ? MainAxisAlignment.start
                            : MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: ClayStyles.surface(radiusValue: 14),
                            child: Padding(
                              padding: const EdgeInsets.all(6),
                              child: Image.asset('assets/images/logo.png',
                                  fit: BoxFit.contain),
                            ),
                          ),
                          if (isDesktop) ...[
                            const SizedBox(width: 12),
                            const Text(
                              'Mario POS',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    Expanded(
                      child: ListView.builder(
                        padding: EdgeInsets.symmetric(
                            horizontal: isDesktop ? 12 : 16),
                        itemCount: navItems.length,
                        itemBuilder: (context, index) {
                          final item = navItems[index];
                          final isSelected = index == _currentIndex;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () =>
                                    setState(() => _currentIndex = index),
                                borderRadius: ClayStyles.radius(20),
                                child: Container(
                                  padding: EdgeInsets.symmetric(
                                    horizontal: isDesktop ? 16 : 0,
                                    vertical: isDesktop ? 12 : 14,
                                  ),
                                  decoration: isSelected
                                      ? ClayStyles.accent(
                                          accent: AppColors.primary,
                                          radiusValue: 20,
                                          opacity: 0.14,
                                        )
                                      : null,
                                  child: isDesktop
                                      ? Row(
                                          children: [
                                            Icon(
                                              isSelected
                                                  ? item.activeIcon
                                                  : item.icon,
                                              color: isSelected
                                                  ? AppColors.primary
                                                  : AppColors.gray500,
                                              size: 24,
                                            ),
                                            const SizedBox(width: 12),
                                            Text(
                                              item.label,
                                              style: TextStyle(
                                                fontSize: 15,
                                                fontWeight: isSelected
                                                    ? FontWeight.w700
                                                    : FontWeight.w500,
                                                color: isSelected
                                                    ? AppColors.primary
                                                    : AppColors.gray600,
                                              ),
                                            ),
                                          ],
                                        )
                                      : Icon(
                                          isSelected
                                              ? item.activeIcon
                                              : item.icon,
                                          color: isSelected
                                              ? AppColors.primary
                                              : AppColors.gray500,
                                          size: 26,
                                        ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: IndexedStack(
                  index: _currentIndex,
                  children: screens,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AnimatedGradientBackground(
        child: IndexedStack(
          index: _currentIndex,
          children: screens,
        ),
      ),
      extendBody: true,
      bottomNavigationBar: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: ClayStyles.radius(30),
          border: Border.all(color: Colors.white.withOpacity(0.6)),
          boxShadow: ClayStyles.raisedShadow(),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: List.generate(navItems.length, (index) {
            final item = navItems[index];
            final isSelected = index == _currentIndex;
            return GestureDetector(
              onTap: () => setState(() => _currentIndex = index),
              behavior: HitTestBehavior.opaque,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: isSelected
                    ? ClayStyles.accent(
                        accent: AppColors.primary,
                        radiusValue: 22,
                        opacity: 0.16,
                      )
                    : null,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isSelected ? item.activeIcon : item.icon,
                      color: isSelected ? AppColors.primary : AppColors.gray500,
                      size: 24,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.label,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight:
                            isSelected ? FontWeight.w700 : FontWeight.w500,
                        color:
                            isSelected ? AppColors.primary : AppColors.gray500,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
  });
}
