import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../widgets/nav.dart';
import '../../widgets/page_scaffold.dart';
import '../stores/store_comparison_screen.dart';
import '../stores/store_details_screen.dart';
import 'category_report.dart';
import 'expense_report.dart';
import 'gst_report.dart';
import 'item_sales_report.dart';
import 'menu_profit_report.dart';
import 'orders_report.dart';
import 'payments_report.dart';
import 'profit_loss_report.dart';
import 'sales_trend_report.dart';

class _ReportLink {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget Function() page;
  const _ReportLink(this.icon, this.title, this.subtitle, this.page);
}

class ReportsHubScreen extends StatelessWidget {
  const ReportsHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final groups = <(String, List<_ReportLink>)>[
      (
        'Sales',
        [
          _ReportLink(Icons.show_chart_rounded, 'Sales trend', 'Daily, weekly & monthly sales, busiest days and hours', () => const SalesTrendReport()),
          _ReportLink(Icons.payments_outlined, 'Payments & channels', 'Cash, UPI, card · dine-in, parcel, delivery · staff', () => const PaymentsReport()),
          _ReportLink(Icons.receipt_long_outlined, 'Orders', 'Completed, cancelled and open orders', () => const OrdersReport()),
        ]
      ),
      (
        'Profit',
        [
          _ReportLink(Icons.account_balance_outlined, 'Profit & loss', 'Sales, item costs, expenses and net profit', () => const ProfitLossReport()),
          _ReportLink(Icons.wallet_outlined, 'Expenses', 'Spending by category, day and vendor', () => const ExpenseReport()),
          _ReportLink(Icons.price_change_outlined, 'Menu profitability', 'Price vs. preparation cost for every item', () => const MenuProfitReport()),
        ]
      ),
      (
        'Products',
        [
          _ReportLink(Icons.local_dining_outlined, 'Item performance', 'Best and worst sellers, quantity, revenue, profit', () => const ItemSalesReport()),
          _ReportLink(Icons.category_outlined, 'Category performance', 'Category revenue share and trend over time', () => const CategoryReport()),
        ]
      ),
      (
        'Tax & stores',
        [
          _ReportLink(Icons.request_quote_outlined, 'GST summary', 'Taxable value, CGST/SGST/IGST, rate-wise split', () => const GstReport()),
          if (s.stores.length > 1)
            _ReportLink(Icons.compare_arrows_rounded, 'Store comparison', 'Sales, expenses and profit across your ${s.stores.length} stores', () => const StoreComparisonScreen()),
          _ReportLink(Icons.storefront_outlined, 'Store details', 'Address, GST and configuration of this store', () => const StoreDetailsScreen()),
        ]
      ),
    ];

    return PageScaffold(
      showRange: false,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
            child: Text('Reports', style: context.text.headlineSmall),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
            child: Text('Every report follows the store and period you pick.', style: context.text.bodySmall),
          ),
          for (final (title, links) in groups) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
              child: Text(title.toUpperCase(),
                  style: context.text.labelSmall?.copyWith(color: context.colors.textMuted, letterSpacing: 1.1, fontWeight: FontWeight.w700)),
            ),
            Container(
              decoration: BoxDecoration(
                color: context.colors.card,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: context.colors.border),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < links.length; i++) ...[
                    if (i > 0) Divider(indent: 68, color: context.colors.border),
                    _LinkTile(link: links[i]),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({required this.link});

  final _ReportLink link;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ListTile(
      onTap: () => push(context, link.page()),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(12)),
        child: Icon(link.icon, color: c.accent, size: 21),
      ),
      title: Text(link.title, style: context.text.titleSmall),
      subtitle: Text(link.subtitle, style: context.text.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: Icon(Icons.chevron_right_rounded, color: c.textMuted),
    );
  }
}
