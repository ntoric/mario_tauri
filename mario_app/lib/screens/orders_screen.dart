import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_timer.dart';
import '../widgets/order_ui.dart';
import 'order_screen.dart';
import 'bill_screen.dart';

const Duration kDelayedAfter = Duration(minutes: 30);

enum ActiveOrderStatus { preparing, delayed }

ActiveOrderStatus activeStatusFor(Order order, DateTime now) {
  return now.difference(order.createdAt) > kDelayedAfter
      ? ActiveOrderStatus.delayed
      : ActiveOrderStatus.preparing;
}

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  String _filter = 'all'; // all | preparing | delayed
  final Set<String> _expanded = {};
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        context.read<DataProvider>().loadOrders(auth.currentStore!.id);
      }
    });
    _tick = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  void _editOrder(Order order, DataProvider data) {
    final table = data.tables
        .where((t) => t.id == order.tableId)
        .firstOrNull;
    if (table == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("This order can't be edited here"),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OrderScreen(
          table: table,
          order: order,
          isNewOrder: false,
        ),
      ),
    );
  }

  Future<void> _cancelOrder(Order order, DataProvider data) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel Order?'),
        content: Text(
          'Are you sure you want to cancel the order for Table ${order.tableNumber}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('No'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
            ),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) {
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => Center(
        child: CircularProgressIndicator(
          color: dialogContext.read<ThemeProvider>().currentTheme.primary,
        ),
      ),
    );

    try {
      final success = await data.cancelOrder(order.id);

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? 'Order cancelled and table released'
                  : (data.error ?? 'Failed to cancel order.'),
            ),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final auth = context.watch<AuthProvider>();
    final palette = context.watch<ThemeProvider>().currentTheme;
    final now = DateTime.now();

    final activeOrders = data.activeOrders;
    final counts = {
      'all': activeOrders.length,
      'preparing': activeOrders
          .where((o) => activeStatusFor(o, now) == ActiveOrderStatus.preparing)
          .length,
      'delayed': activeOrders
          .where((o) => activeStatusFor(o, now) == ActiveOrderStatus.delayed)
          .length,
    };
    final orders = _filter == 'all'
        ? activeOrders
        : activeOrders
            .where((o) => activeStatusFor(o, now).name == _filter)
            .toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: ScreenHeader(
              title: 'Active Orders',
              subtitle: auth.currentStore?.displayName,
              showSubtitleChevron: true,
              onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
            ),
          ),
          if (activeOrders.isNotEmpty)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  _StatusChip(
                    label: 'All',
                    count: counts['all']!,
                    selected: _filter == 'all',
                    onTap: () => setState(() => _filter = 'all'),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(
                    label: 'Preparing',
                    count: counts['preparing']!,
                    icon: Icons.hourglass_bottom_rounded,
                    color: palette.highlight,
                    selected: _filter == 'preparing',
                    onTap: () => setState(() => _filter = 'preparing'),
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(
                    label: 'Delayed',
                    count: counts['delayed']!,
                    icon: Icons.schedule,
                    color: AppColors.danger,
                    selected: _filter == 'delayed',
                    dangerUnselected: true,
                    onTap: () => setState(() => _filter = 'delayed'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: activeOrders.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 92,
                          height: 92,
                          decoration: BoxDecoration(
                            color: palette.primarySoft,
                            borderRadius: BorderRadius.circular(28),
                          ),
                          child: Icon(
                            Icons.receipt_long_outlined,
                            size: 40,
                            color: palette.primary,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'No active orders',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: AppColors.dark,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Create orders from the Tables tab',
                          style: TextStyle(
                            fontSize: 14,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  )
                : orders.isEmpty
                    ? Center(
                        child: Text(
                          'No $_filter orders',
                          style: const TextStyle(
                            fontSize: 15,
                            color: AppColors.gray500,
                          ),
                        ),
                      )
                    : ListView.builder(
                        padding: EdgeInsets.fromLTRB(16, 8, 16,
                            24 + MediaQuery.of(context).padding.bottom),
                        itemCount: orders.length,
                        itemBuilder: (context, index) {
                          final order = orders[index];
                          return ActiveOrderCard(
                            order: order,
                            status: activeStatusFor(order, now),
                            expanded: _expanded.contains(order.id),
                            remoteBillingEnabled:
                                auth.currentStore?.remoteBillingEnabled == true,
                            onToggle: () {
                              setState(() {
                                if (!_expanded.remove(order.id)) {
                                  _expanded.add(order.id);
                                }
                              });
                            },
                            onView: () => _editOrder(order, data),
                            onEdit: () => _editOrder(order, data),
                            onBill: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => BillScreen(order: order),
                                ),
                              );
                            },
                            onCancel: () => _cancelOrder(order, data),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final int count;
  final IconData? icon;
  final Color? color;
  final bool selected;
  final bool dangerUnselected;
  final VoidCallback onTap;

  const _StatusChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.icon,
    this.color,
    this.dangerUnselected = false,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final chipBg = selected ? palette.highlight : Colors.white;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: chipBg,
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
              color: selected
                  ? palette.highlight.withOpacity(0.3)
                  : AppColors.dark.withOpacity(0.08),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 18,
                color: selected ? Colors.white : color,
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected
                    ? Colors.white
                    : (dangerUnselected ? AppColors.danger : AppColors.dark),
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: selected
                    ? Colors.white.withOpacity(0.25)
                    : AppColors.gray200,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : AppColors.dark,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ActiveOrderCard extends StatelessWidget {
  final Order order;
  final ActiveOrderStatus status;
  final bool expanded;
  final bool remoteBillingEnabled;
  final VoidCallback onToggle;
  final VoidCallback onView;
  final VoidCallback onEdit;
  final VoidCallback onBill;
  final VoidCallback onCancel;

  const ActiveOrderCard({
    super.key,
    required this.order,
    required this.status,
    required this.expanded,
    required this.onToggle,
    required this.onView,
    required this.onEdit,
    required this.onBill,
    required this.onCancel,
    this.remoteBillingEnabled = false,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final statusColor =
        status == ActiveOrderStatus.delayed ? AppColors.danger : palette.highlight;
    final statusIcon = status == ActiveOrderStatus.delayed
        ? Icons.schedule
        : Icons.hourglass_bottom_rounded;
    final statusLabel =
        status == ActiveOrderStatus.delayed ? 'Delayed' : 'Preparing';
    final itemCount =
        order.items.fold<int>(0, (sum, i) => sum + i.quantity);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: AppColors.dark.withOpacity(0.05),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 4,
                  child: _infoTile(
                    statusColor,
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.table_restaurant_outlined,
                              size: 18, color: statusColor),
                          const SizedBox(width: 6),
                          Text(
                            order.tableNumber == 0
                                ? 'Parcel'
                                : 'Table ${order.tableNumber}',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: statusColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 4,
                  child: _infoTile(
                    statusColor,
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.hourglass_bottom_rounded,
                                  size: 14, color: statusColor),
                              const SizedBox(width: 4),
                              OrderTimer(
                                order: order,
                                showIcon: false,
                                textStyle: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: statusColor,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Ordered ${DateFormat('hh:mm a').format(order.createdAt)}',
                            style: const TextStyle(
                              fontSize: 10.5,
                              color: AppColors.gray600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 3,
                  child: _infoTile(
                    statusColor,
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(statusIcon,
                              size: 14, color: statusColor),
                          const SizedBox(width: 4),
                          Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: statusColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: palette.background,
              borderRadius: BorderRadius.circular(16),
            ),
            child: AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeInOut,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (expanded) ...[
                    Text(
                      'Order Items (${order.items.length})',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    for (var i = 0; i < order.items.length; i++) ...[
                      if (i > 0)
                        const Divider(
                            height: 20, thickness: 1, color: AppColors.gray300),
                      _OrderItemRow(orderItem: order.items[i]),
                    ],
                  ] else ...[
                    if (order.items.isNotEmpty)
                      _OrderItemRow(orderItem: order.items.first),
                    if (order.items.length > 1)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          '+${order.items.length - 1} more item(s)',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: palette.highlight,
                          ),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: expanded ? const EdgeInsets.all(12) : EdgeInsets.zero,
            decoration: expanded
                ? BoxDecoration(
                    color: palette.highlight.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(14),
                  )
                : null,
            child: Row(
              children: [
                Tooltip(
                  message: expanded ? 'Hide items' : 'Show items',
                  child: InkWell(
                    onTap: onToggle,
                    borderRadius: BorderRadius.circular(999),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        color: AppColors.gray200,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        expanded
                            ? Icons.keyboard_arrow_up
                            : Icons.keyboard_arrow_down,
                        size: 20,
                        color: AppColors.dark,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Material(
                  color: AppColors.gray200,
                  shape: const CircleBorder(),
                  child: InkWell(
                    onTap: () => _showOrderActions(context),
                    customBorder: const CircleBorder(),
                    child: const SizedBox(
                      width: 40,
                      height: 40,
                      child: Icon(Icons.more_horiz,
                          size: 20, color: AppColors.gray700),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 5,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Total • $itemCount item(s)',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.gray600),
                        ),
                        Text(
                          '₹${order.totalAmount.toStringAsFixed(2)}',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: expanded
                                ? palette.highlight
                                : AppColors.dark,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 4,
                  child: InkWell(
                    onTap: onView,
                    borderRadius: BorderRadius.circular(999),
                    child: Container(
                      height: 44,
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 12),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  expanded ? 'View Details' : 'View',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: statusColor,
                                  ),
                                ),
                                Icon(Icons.chevron_right,
                                    size: 18, color: statusColor),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _infoTile(Color statusColor, Widget child) {
    return Container(
      constraints: const BoxConstraints(minHeight: 52),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.10),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Center(child: child),
    );
  }

  void _showOrderActions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => _OrderActionsSheet(
        order: order,
        remoteBillingEnabled: remoteBillingEnabled,
        onEdit: () {
          Navigator.pop(sheetContext);
          onEdit();
        },
        onBill: () {
          Navigator.pop(sheetContext);
          onBill();
        },
        onCancel: () {
          Navigator.pop(sheetContext);
          onCancel();
        },
      ),
    );
  }
}

class _OrderActionsSheet extends StatelessWidget {
  final Order order;
  final bool remoteBillingEnabled;
  final VoidCallback onEdit;
  final VoidCallback onBill;
  final VoidCallback onCancel;

  const _OrderActionsSheet({
    required this.order,
    required this.remoteBillingEnabled,
    required this.onEdit,
    required this.onBill,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final itemCount =
        order.items.fold<int>(0, (sum, i) => sum + i.quantity);

    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        decoration: ClayStyles.surface(radiusValue: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 42,
              height: 5,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: palette.primary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    order.tableNumber == 0
                        ? Icons.shopping_bag_outlined
                        : Icons.table_restaurant_outlined,
                    size: 22,
                    color: palette.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.tableNumber == 0
                            ? 'Parcel Order'
                            : 'Table ${order.tableNumber}',
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                      Text(
                        '$itemCount item(s) • ₹${order.totalAmount.toStringAsFixed(0)}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.gray600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: _OrderActionTile(
                    icon: Icons.edit_rounded,
                    label: 'Edit Order',
                    color: palette.primary,
                    onTap: onEdit,
                  ),
                ),
                if (remoteBillingEnabled) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: _OrderActionTile(
                      icon: Icons.receipt_long_rounded,
                      label: 'Checkout & Print',
                      color: AppColors.tableAvailable,
                      onTap: onBill,
                    ),
                  ),
                ],
                const SizedBox(width: 10),
                Expanded(
                  child: _OrderActionTile(
                    icon: Icons.cancel_outlined,
                    label: 'Cancel Order',
                    color: AppColors.danger,
                    labelColor: AppColors.danger,
                    onTap: onCancel,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color? labelColor;
  final VoidCallback onTap;

  const _OrderActionTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.labelColor,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 76,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.black.withOpacity(0.07)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(height: 6),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: labelColor ?? AppColors.dark,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderItemRow extends StatelessWidget {
  final OrderItem orderItem;

  const _OrderItemRow({required this.orderItem});

  @override
  Widget build(BuildContext context) {
    final unit = orderItem.unitPrice ?? orderItem.item.price;
    return Row(
      children: [
        ItemThumb(item: orderItem.item, size: 48),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                orderItem.item.name,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.dark,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                '₹${unit.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.gray600,
                ),
              ),
            ],
          ),
        ),
        Text(
          'x${orderItem.quantity}',
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.dark,
          ),
        ),
      ],
    );
  }
}
