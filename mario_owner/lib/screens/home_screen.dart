import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/app_bottom_nav.dart';
import 'dashboard_screen.dart';
import 'orders_screen.dart';
import 'sales_screen.dart';
import 'reports_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;
  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      DashboardScreen(onTabChange: (index) => setState(() => _currentIndex = index)),
      const SalesScreen(),
      const ReportsScreen(),
      const OrdersScreen(),
      const SettingsScreen(),
    ];
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      final data = context.read<DataProvider>();
      if (auth.currentStore != null) {
        data.loadStoreData(auth.currentStore!.id);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final navItems = [
      {'icon': Icons.dashboard_outlined, 'activeIcon': Icons.dashboard_rounded, 'label': 'Dashboard'},
      {'icon': Icons.bar_chart_outlined, 'activeIcon': Icons.bar_chart_rounded, 'label': 'Sales'},
      {'icon': Icons.assessment_outlined, 'activeIcon': Icons.assessment_rounded, 'label': 'Reports'},
      {'icon': Icons.receipt_outlined, 'activeIcon': Icons.receipt_rounded, 'label': 'Orders'},
      {'icon': Icons.settings_outlined, 'activeIcon': Icons.settings_rounded, 'label': 'Settings'},
    ];

    final isTablet = ResponsiveHelper.isTablet(context);
    final isDesktop = ResponsiveHelper.isDesktop(context);

    if (isTablet || isDesktop) {
      return Scaffold(
        body: Row(
          children: [
            Container(
              decoration: BoxDecoration(
                color: AppColors.light,
                boxShadow: AppColors.cardShadow,
              ),
              child: NavigationRail(
                extended: isDesktop,
                minExtendedWidth: 220,
                selectedIndex: _currentIndex,
                onDestinationSelected: (index) {
                  setState(() => _currentIndex = index);
                },
                backgroundColor: Colors.transparent,
                selectedIconTheme: const IconThemeData(
                  color: AppColors.primary,
                  size: 28,
                ),
                unselectedIconTheme: const IconThemeData(
                  color: AppColors.gray400,
                  size: 24,
                ),
                selectedLabelTextStyle: const TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
                unselectedLabelTextStyle: const TextStyle(
                  color: AppColors.gray500,
                  fontWeight: FontWeight.w500,
                ),
                destinations: navItems.map((item) {
                  return NavigationRailDestination(
                    icon: Icon(item['icon'] as IconData),
                    selectedIcon: Icon(item['activeIcon'] as IconData),
                    label: Text(item['label'] as String),
                  );
                }).toList(),
              ),
            ),
            Expanded(
              child: AnimatedPage(
                keyId: _currentIndex,
                child: IndexedStack(
                  index: _currentIndex,
                  children: _screens,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      body: AnimatedPage(
        keyId: _currentIndex,
        child: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
      ),
      bottomNavigationBar: AppBottomNav(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
      ),
    );
  }
}
