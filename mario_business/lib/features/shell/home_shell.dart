import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../dashboard/dashboard_screen.dart';
import '../products/products_screen.dart';
import '../reports/reports_hub_screen.dart';
import '../sales/sales_screen.dart';
import '../settings/settings_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  static const _pages = [
    DashboardScreen(),
    SalesScreen(),
    ProductsScreen(),
    ReportsHubScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final hasStore = context.select<Session, bool>((s) => s.store != null);
    return Scaffold(
      body: hasStore || _tab == 4 ? IndexedStack(index: _tab, children: _pages) : const _NoStores(),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(border: Border(top: BorderSide(color: context.colors.border))),
        child: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.space_dashboard_outlined), selectedIcon: Icon(Icons.space_dashboard_rounded), label: 'Overview'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long_rounded), label: 'Sales'),
            NavigationDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu_rounded), label: 'Products'),
            NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights_rounded), label: 'Reports'),
            NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings_rounded), label: 'Settings'),
          ],
        ),
      ),
    );
  }
}

/// Shown when the superadmin hasn't assigned any store to this owner yet.
class _NoStores extends StatefulWidget {
  const _NoStores();

  @override
  State<_NoStores> createState() => _NoStoresState();
}

class _NoStoresState extends State<_NoStores> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: EmptyState(
          icon: Icons.storefront_outlined,
          title: 'No stores assigned yet',
          message: 'Your administrator needs to assign at least one store to your account. Once they do, tap refresh.',
          action: FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size(160, 48)),
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    try {
                      await context.read<Session>().refreshStores();
                    } catch (e) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Refresh'),
          ),
        ),
      ),
    );
  }
}
