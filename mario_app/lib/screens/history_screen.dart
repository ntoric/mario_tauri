import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/order.dart';
import '../models/item.dart';
import '../models/table.dart';
import '../utils/constants.dart';
import '../widgets/animated_gradient_background.dart';
import '../widgets/app_header.dart';
import '../widgets/order_ui.dart';
import 'order_screen.dart';
import 'parcel_order_screen.dart';

/// Order number shown on history cards: the bill's invoice number when one
/// exists for the order, otherwise the first 6 chars of the order id.
String orderNumberFor(Order order, Map<String, String> invoiceNos) {
  final invoice = invoiceNos[order.id];
  if (invoice != null && invoice.isNotEmpty) return invoice;
  return order.id.length <= 6
      ? order.id.toUpperCase()
      : order.id.substring(0, 6).toUpperCase();
}

/// Rebuilds an order's items against the current menu, skipping items that no
/// longer exist or are inactive. Returns the new items plus the skipped count.
(List<OrderItem>, int) buildReorderItems(Order order, List<Item> items) {
  final result = <OrderItem>[];
  var skipped = 0;
  for (final orderItem in order.items) {
    final current =
        items.where((i) => i.id == orderItem.itemId).firstOrNull;
    if (current == null || !current.isActive) {
      skipped++;
      continue;
    }
    result.add(OrderItem(
      itemId: current.id,
      item: current,
      quantity: orderItem.quantity,
    ));
  }
  return (result, skipped);
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String _filterStatus = 'all';
  String _searchQuery = '';
  DateTimeRange? _selectedDateRange;
  final Set<String> _expandedOrderIds = {};
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _searchFocusNode.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        context.read<DataProvider>().loadOrders(auth.currentStore!.id);
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  Future<void> _selectDateRange() async {
    final palette = context.read<ThemeProvider>().currentTheme;
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _selectedDateRange,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: palette.primary,
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
        _selectedDateRange = picked;
      });
    }
  }

  bool _matchesSearch(Order order, String query, String orderNo) {
    final q = query.toLowerCase();
    final matchesTable = order.tableNumber.toString() == q ||
        'table ${order.tableNumber}'.toLowerCase().contains(q) ||
        (order.tableNumber == 0 && 'parcel'.contains(q));
    final matchesItems =
        order.items.any((item) => item.item.name.toLowerCase().contains(q));
    final no = orderNo.toLowerCase();
    final matchesNo =
        no.contains(q) || no.contains(q.startsWith('#') ? q.substring(1) : q);
    return matchesTable || matchesItems || matchesNo;
  }

  Future<void> _cancelOrder(Order order, DataProvider data) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel Order?'),
        content: Text(
          'Are you sure you want to cancel this completed order for ${order.tableNumber == 0 ? 'Parcel Order' : 'Table ${order.tableNumber}'}?',
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
                  ? 'Order cancelled successfully'
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

  Future<void> _printBill(Order order, DataProvider data) async {
    final matchingBills =
        data.bills.where((b) => b.orderId == order.id).toList();
    if (matchingBills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No bill found for this order'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }
    final bill = matchingBills.first;

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
      final success = await data.enqueueBill({
        'orderId': bill.orderId,
        'tableNumber': bill.tableNumber,
        'invoiceNo': bill.invoiceNo,
        'items': bill.items
            .map((i) => {
                  'itemId': i.itemId,
                  'quantity': i.quantity,
                  'unitPrice': i.unitPrice,
                })
            .toList(),
        'subtotal': bill.subtotal,
        'taxTotal': bill.taxTotal,
        'discount': bill.discount,
        'total': bill.total,
        'paymentMethod': bill.paymentMethod,
        'customerName': bill.customerName,
        'storeId': bill.storeId,
      });

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? 'Bill sent to printer'
                  : (data.error ?? 'Failed to print bill.'),
            ),
            backgroundColor:
                success ? AppColors.success : AppColors.danger,
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

  void _reorder(Order order, DataProvider data) {
    final (items, skipped) = buildReorderItems(order, data.items);
    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('None of these items are available any more'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }

    void notifySkipped() {
      if (skipped > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '$skipped item(s) no longer available were skipped'),
            backgroundColor: AppColors.warning,
          ),
        );
      }
    }

    if (order.tableNumber == 0) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (ctx) => Scaffold(
            backgroundColor: Colors.transparent,
            body: AnimatedGradientBackground(
              child: ParcelOrderScreen(
                showBack: true,
                initialItems: items,
                onOrderSuccess: () => Navigator.of(ctx).pop(),
              ),
            ),
          ),
        ),
      );
      notifySkipped();
      return;
    }

    TableModel? table = data.tables
        .where((t) => t.id == order.tableId)
        .firstOrNull;
    table ??= data.tables
        .where((t) => t.number == order.tableNumber)
        .firstOrNull;
    if (table == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Table ${order.tableNumber} no longer exists'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }
    if (data.isTableOccupied(table.id)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Table ${table.number} is occupied — finish its current order first'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => OrderScreen(
          table: table!,
          isNewOrder: true,
          initialItems: items,
        ),
      ),
    );
    notifySkipped();
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final auth = context.watch<AuthProvider>();
    final palette = context.watch<ThemeProvider>().currentTheme;

    final invoiceNos = <String, String>{
      for (final b in data.bills)
        if (b.invoiceNo != null && b.invoiceNo!.isNotEmpty)
          b.orderId: b.invoiceNo!,
    };

    // Date + search filters applied first; counts ignore the status filter.
    final baseOrders = data.orders.where((o) {
      if (o.status == 'active') return false;
      if (_selectedDateRange != null) {
        final start = DateTime(
          _selectedDateRange!.start.year,
          _selectedDateRange!.start.month,
          _selectedDateRange!.start.day,
        );
        final end = DateTime(
          _selectedDateRange!.end.year,
          _selectedDateRange!.end.month,
          _selectedDateRange!.end.day,
          23,
          59,
          59,
        );
        if (o.createdAt.isBefore(start) || o.createdAt.isAfter(end)) {
          return false;
        }
      }
      if (_searchQuery.isNotEmpty &&
          !_matchesSearch(o, _searchQuery, orderNumberFor(o, invoiceNos))) {
        return false;
      }
      return true;
    }).toList();

    final counts = {
      'all': baseOrders.length,
      'completed': baseOrders.where((o) => o.status == 'completed').length,
      'cancelled': baseOrders.where((o) => o.status == 'cancelled').length,
    };

    final orders = _filterStatus == 'all'
        ? baseOrders
        : baseOrders.where((o) => o.status == _filterStatus).toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: ScreenHeader(
              title: 'Order History',
              subtitle: auth.currentStore?.displayName,
              showSubtitleChevron: true,
              onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
            ),
          ),
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _HistoryStatusChip(
                  label: 'All',
                  count: counts['all']!,
                  selected: _filterStatus == 'all',
                  onTap: () => setState(() => _filterStatus = 'all'),
                ),
                const SizedBox(width: 8),
                _HistoryStatusChip(
                  label: 'Completed',
                  count: counts['completed']!,
                  icon: Icons.check_circle,
                  iconColor: AppColors.tableAvailable,
                  selected: _filterStatus == 'completed',
                  onTap: () => setState(() => _filterStatus = 'completed'),
                ),
                const SizedBox(width: 8),
                _HistoryStatusChip(
                  label: 'Cancelled',
                  count: counts['cancelled']!,
                  icon: Icons.cancel,
                  iconColor: AppColors.danger,
                  selected: _filterStatus == 'cancelled',
                  onTap: () => setState(() => _filterStatus = 'cancelled'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: HistorySearchBar(
              controller: _searchController,
              focusNode: _searchFocusNode,
              query: _searchQuery,
              range: _selectedDateRange,
              onChanged: (value) =>
                  setState(() => _searchQuery = value),
              onClearQuery: () {
                _searchController.clear();
                setState(() => _searchQuery = '');
              },
              onPickRange: _selectDateRange,
              onClearRange: () =>
                  setState(() => _selectedDateRange = null),
            ),
          ),
          Expanded(
            child: orders.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(
                            color: palette.primarySoft,
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: Icon(
                            Icons.history_outlined,
                            size: 40,
                            color: palette.primary,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'No orders found',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppColors.gray600,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: EdgeInsets.fromLTRB(
                        16, 4, 16, 24 + MediaQuery.of(context).padding.bottom),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      return HistoryOrderCard(
                        order: order,
                        orderNo: orderNumberFor(order, invoiceNos),
                        expanded: _expandedOrderIds.contains(order.id),
                        onToggle: () {
                          setState(() {
                            if (!_expandedOrderIds.remove(order.id)) {
                              _expandedOrderIds.add(order.id);
                            }
                          });
                        },
                        onReorder: () => _reorder(order, data),
                        onPrint: order.isCompleted
                            ? () => _printBill(order, data)
                            : null,
                        onCancel: order.isCompleted
                            ? () => _cancelOrder(order, data)
                            : null,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _HistoryStatusChip extends StatelessWidget {
  final String label;
  final int count;
  final IconData? icon;
  final Color? iconColor;
  final bool selected;
  final VoidCallback onTap;

  const _HistoryStatusChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.icon,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? palette.highlight : Colors.white,
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
                color: selected ? Colors.white : iconColor,
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected ? Colors.white : AppColors.dark,
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

class HistoryOrderCard extends StatelessWidget {
  final Order order;
  final String orderNo;
  final bool expanded;
  final VoidCallback onToggle;
  final VoidCallback onReorder;
  final VoidCallback? onPrint;
  final VoidCallback? onCancel;

  const HistoryOrderCard({
    super.key,
    required this.order,
    required this.orderNo,
    required this.expanded,
    required this.onToggle,
    required this.onReorder,
    this.onPrint,
    this.onCancel,
  });

  static const _dateFormat = 'MMM dd, yyyy HH:mm';

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    Color statusColor;
    IconData statusIcon;
    switch (order.status) {
      case 'completed':
        statusColor = AppColors.tableAvailable;
        statusIcon = Icons.check_circle;
        break;
      case 'cancelled':
        statusColor = AppColors.danger;
        statusIcon = Icons.cancel;
        break;
      default:
        statusColor = AppColors.gray600;
        statusIcon = Icons.help;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
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
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(20),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(statusIcon, color: statusColor, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                order.tableNumber == 0
                                    ? 'Parcel Order'
                                    : 'Table ${order.tableNumber}',
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.dark,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: statusColor.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                order.status.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: statusColor,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today_outlined,
                                  size: 13, color: AppColors.gray600),
                              const SizedBox(width: 4),
                              Text(
                                DateFormat(_dateFormat)
                                    .format(order.createdAt),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.gray600,
                                ),
                              ),
                              const SizedBox(width: 14),
                              const Icon(Icons.receipt_long_outlined,
                                  size: 13, color: AppColors.gray600),
                              const SizedBox(width: 4),
                              Text(
                                '#$orderNo',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.gray600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '₹${order.totalAmount.toStringAsFixed(0)}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    expanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_right,
                    color: AppColors.gray600,
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            child: expanded
                ? _buildExpandedBody(context, palette)
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildExpandedBody(BuildContext context, AppThemeOption palette) {
    final subtotal = order.totalAmount - order.taxAmount;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: palette.background,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Order Items (${order.items.length})',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: AppColors.dark,
                          ),
                        ),
                      ),
                    ),
                    InkWell(
                      onTap: onReorder,
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: palette.highlight.withOpacity(0.4)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.refresh_rounded,
                                size: 16, color: palette.highlight),
                            const SizedBox(width: 4),
                            Text(
                              'Reorder',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: palette.highlight,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                for (final orderItem in order.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        ItemThumb(item: orderItem.item, size: 44),
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
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                '₹${(orderItem.unitPrice ?? orderItem.item.price).toStringAsFixed(2)}',
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
                            fontWeight: FontWeight.w600,
                            color: AppColors.dark,
                          ),
                        ),
                      ],
                    ),
                  ),
                const _DashedDivider(),
                const SizedBox(height: 10),
                _MoneyRow(
                  label: 'Subtotal',
                  value: '₹${subtotal.toStringAsFixed(2)}',
                ),
                const SizedBox(height: 6),
                _MoneyRow(
                  label: 'Tax',
                  value: '₹${order.taxAmount.toStringAsFixed(2)}',
                ),
                Container(
                  margin: const EdgeInsets.only(top: 10),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: palette.highlight.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Text(
                        'Total',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '₹${order.totalAmount.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: palette.highlight,
                        ),
                      ),
                    ],
                  ),
                ),
                if (order.paymentMethod != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(
                      children: [
                        const Icon(Icons.credit_card,
                            size: 20, color: AppColors.tableAvailable),
                        const SizedBox(width: 10),
                        const Text(
                          'Payment Method',
                          style:
                              TextStyle(fontSize: 13, color: AppColors.gray600),
                        ),
                        const Spacer(),
                        Text(
                          order.paymentMethod!.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 13,
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
          if (order.isCompleted && (onPrint != null || onCancel != null)) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (onPrint != null)
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: TextButton.icon(
                        onPressed: onPrint,
                        icon: const Icon(Icons.print_outlined, size: 20),
                        label: const Text('Print Bill'),
                        style: TextButton.styleFrom(
                          foregroundColor: palette.highlight,
                          backgroundColor:
                              palette.highlight.withOpacity(0.08),
                          textStyle: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                  ),
                if (onPrint != null && onCancel != null)
                  const SizedBox(width: 10),
                if (onCancel != null)
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: TextButton.icon(
                        onPressed: onCancel,
                        icon: const Icon(Icons.cancel, size: 20),
                        label: const Text('Cancel Order'),
                        style: TextButton.styleFrom(
                          foregroundColor: AppColors.danger,
                          backgroundColor:
                              AppColors.danger.withOpacity(0.08),
                          textStyle: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MoneyRow extends StatelessWidget {
  final String label;
  final String value;

  const _MoneyRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style:
                const TextStyle(fontSize: 13, color: AppColors.gray600)),
        Text(value,
            style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.dark)),
      ],
    );
  }
}

class _DashedDivider extends StatelessWidget {
  const _DashedDivider();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 6.0;
        const dashGap = 5.0;
        final count =
            (constraints.maxWidth / (dashWidth + dashGap)).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(
            count,
            (_) => Container(
              width: dashWidth,
              height: 1,
              color: AppColors.gray300,
            ),
          ),
        );
      },
    );
  }
}

class HistorySearchBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String query;
  final DateTimeRange? range;
  final ValueChanged<String> onChanged;
  final VoidCallback onClearQuery;
  final VoidCallback onPickRange;
  final VoidCallback onClearRange;

  const HistorySearchBar({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.query,
    required this.range,
    required this.onChanged,
    required this.onClearQuery,
    required this.onPickRange,
    required this.onClearRange,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final focused = focusNode.hasFocus;
    final active = focused || query.isNotEmpty;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      height: 52,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: focused ? palette.primary : AppColors.gray200,
          width: focused ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.dark.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          const SizedBox(width: 16),
          Icon(
            Icons.search_rounded,
            size: 22,
            color: active ? palette.primary : AppColors.gray500,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextSelectionTheme(
              data: TextSelectionThemeData(
                cursorColor: palette.primary,
                selectionColor: palette.primary.withOpacity(0.25),
                selectionHandleColor: palette.primary,
              ),
              child: TextField(
                controller: controller,
                focusNode: focusNode,
                textInputAction: TextInputAction.search,
                cursorColor: palette.primary,
                style: const TextStyle(fontSize: 15, color: AppColors.dark),
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: 'Search table, item or order no.',
                  hintStyle:
                      TextStyle(fontSize: 14.5, color: AppColors.gray500),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
                onChanged: onChanged,
              ),
            ),
          ),
          if (query.isNotEmpty)
            GestureDetector(
              onTap: onClearQuery,
              child: Container(
                width: 28,
                height: 28,
                decoration: const BoxDecoration(
                  color: AppColors.gray200,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.close_rounded,
                    size: 16, color: AppColors.gray700),
              ),
            ),
          const SizedBox(width: 8),
          Container(width: 1, height: 24, color: AppColors.gray200),
          const SizedBox(width: 6),
          Tooltip(
            message: 'Filter by date',
            child: InkWell(
              onTap: onPickRange,
              borderRadius: BorderRadius.circular(999),
              child: Container(
                height: 40,
                padding: const EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(
                  color: range != null
                      ? palette.primary.withOpacity(0.10)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.calendar_month_outlined,
                      size: range != null ? 16 : 20,
                      color: palette.primary,
                    ),
                    if (range != null) ...[
                      const SizedBox(width: 6),
                      ConstrainedBox(
                        constraints:
                            const BoxConstraints(maxWidth: 120),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            '${DateFormat('d MMM').format(range!.start)} – ${DateFormat('d MMM').format(range!.end)}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: palette.primary,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      GestureDetector(
                        onTap: onClearRange,
                        child: Icon(Icons.close_rounded,
                            size: 14, color: palette.primary),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
        ],
      ),
    );
  }
}
