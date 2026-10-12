import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../models/order.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import 'bill_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, this.isActive = false});

  // Whether this tab is currently visible inside HomeScreen's IndexedStack.
  // Data is fetched lazily the first time the tab becomes active.
  final bool isActive;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String _filterStatus = 'all';
  String _searchQuery = '';
  DateTimeRange? _selectedDateRange;
  String? _expandedOrderId;
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(HistoryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      _fetchOrders();
    }
  }

  // Loads orders for the selected date range, defaulting to the last 7 days
  // so the whole order history is never downloaded.
  void _fetchOrders() {
    final auth = context.read<AuthProvider>();
    if (auth.currentStore == null) return;

    final range = _selectedDateRange;
    context.read<DataProvider>().loadHistoryOrders(
          auth.currentStore!.id,
          from: range?.start ??
              DateTime.now().subtract(const Duration(days: 7)),
          to: range == null
              ? null
              : DateTime(range.end.year, range.end.month, range.end.day, 23,
                  59, 59),
        );
  }

  Future<void> _selectDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDateRange: _selectedDateRange,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: AppColors.primary,
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
      _fetchOrders();
    }
  }

  bool _matchesFilters(Order order) {
    if (order.status == 'active') {
      return false;
    }

    // 1. Status Filter
    if (_filterStatus != 'all' && order.status != _filterStatus) {
      return false;
    }

    // 2. Date Range Filter
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
      if (order.createdAt.isBefore(start) || order.createdAt.isAfter(end)) {
        return false;
      }
    }

    // 3. Search Query Filter
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      final matchesTable = order.tableLabel.toLowerCase() == query ||
          'table ${order.tableLabel}'.toLowerCase().contains(query) ||
          'table ${order.tableNumber}'.toLowerCase() == query ||
          order.tableNumber.toString() == query;
      final matchesItems = order.items
          .any((item) => item.item.name.toLowerCase().contains(query));

      if (!matchesTable && !matchesItems) {
        return false;
      }
    }

    return true;
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final historyOrders =
        data.historyOrders.where((o) => o.status != 'active').toList();
    final completedCount =
        historyOrders.where((o) => o.status == 'completed').length;
    final cancelledCount =
        historyOrders.where((o) => o.status == 'cancelled').length;
    final orders = historyOrders.where(_matchesFilters).toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Order History',
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Column(
              children: [
                Row(
                  children: [
                    _statusPill(
                      label: 'All',
                      count: historyOrders.length,
                      value: 'all',
                    ),
                    const SizedBox(width: 8),
                    _statusPill(
                      label: 'Completed',
                      count: completedCount,
                      value: 'completed',
                      dotColor: AppColors.success,
                    ),
                    const SizedBox(width: 8),
                    _statusPill(
                      label: 'Cancelled',
                      count: cancelledCount,
                      value: 'cancelled',
                      dotColor: AppColors.danger,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.gray500.withOpacity(0.1),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: TextField(
                          controller: _searchController,
                          decoration: InputDecoration(
                            hintText: 'Search by table or item...',
                            hintStyle: const TextStyle(
                              color: AppColors.gray400,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                            prefixIcon: const Icon(
                              Icons.search,
                              color: AppColors.gray400,
                              size: 20,
                            ),
                            suffixIcon: _searchQuery.isEmpty
                                ? null
                                : IconButton(
                                    icon: const Icon(Icons.close,
                                        color: AppColors.gray400, size: 18),
                                    onPressed: () {
                                      _searchController.clear();
                                      setState(() => _searchQuery = '');
                                    },
                                  ),
                            filled: true,
                            fillColor: Colors.transparent,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 14),
                          ),
                          onChanged: (value) {
                            setState(() {
                              _searchQuery = value;
                            });
                          },
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Material(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        onTap: _selectDateRange,
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: _selectedDateRange != null
                                  ? AppColors.primary
                                  : AppColors.gray300,
                            ),
                          ),
                          child: Icon(
                            Icons.calendar_today_outlined,
                            size: 20,
                            color: _selectedDateRange != null
                                ? AppColors.primary
                                : AppColors.gray600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_selectedDateRange != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${DateFormat('MM/dd').format(_selectedDateRange!.start)} - ${DateFormat('MM/dd').format(_selectedDateRange!.end)}',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedDateRange = null;
                                });
                                _fetchOrders();
                              },
                              child: Icon(
                                Icons.close,
                                size: 16,
                                color: AppColors.primary,
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
          const SizedBox(height: 14),
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
                            color: AppColors.gray200,
                            borderRadius: BorderRadius.circular(24),
                          ),
                          child: const Icon(
                            Icons.history_outlined,
                            size: 40,
                            color: AppColors.gray400,
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
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      return _buildOrderCard(orders[index], data);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _statusPill({
    required String label,
    required int count,
    required String value,
    Color? dotColor,
  }) {
    final selected = _filterStatus == value;
    return GestureDetector(
      onTap: () => setState(() => _filterStatus = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray300,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.3),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : [
                  BoxShadow(
                    color: AppColors.gray500.withOpacity(0.08),
                    blurRadius: 6,
                    offset: const Offset(0, 2),
                  ),
                ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dotColor != null) ...[
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: selected ? Colors.white : dotColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.gray600,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: selected
                    ? Colors.white.withOpacity(0.25)
                    : AppColors.gray200,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: selected ? Colors.white : AppColors.gray700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrderCard(Order order, DataProvider data) {
    final expanded = _expandedOrderId == order.id;
    final isCompleted = order.status == 'completed';
    final isCancelled = order.status == 'cancelled';
    final statusColor = isCompleted
        ? AppColors.success
        : isCancelled
            ? AppColors.danger
            : AppColors.gray600;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.gray500.withOpacity(0.12),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            setState(() {
              _expandedOrderId = expanded ? null : order.id;
            });
          },
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: isCompleted
                            ? statusColor
                            : statusColor.withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        isCompleted
                            ? Icons.check
                            : isCancelled
                                ? Icons.close
                                : Icons.help_outline,
                        color: isCompleted ? Colors.white : statusColor,
                        size: 24,
                      ),
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
                                      : order.tableLabel,
                                  style: const TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.dark,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: statusColor.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  order.status.toUpperCase(),
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: statusColor,
                                    letterSpacing: 0.4,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            DateFormat('MMM dd, yyyy · HH:mm')
                                .format(order.createdAt),
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w500,
                              color: AppColors.gray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '₹${order.totalAmount.toStringAsFixed(0)}',
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                        letterSpacing: -0.3,
                      ),
                    ),
                    Icon(
                      expanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      size: 22,
                      color:
                          expanded ? AppColors.primary : AppColors.gray500,
                    ),
                  ],
                ),
                AnimatedCrossFade(
                  duration: const Duration(milliseconds: 220),
                  crossFadeState: expanded
                      ? CrossFadeState.showSecond
                      : CrossFadeState.showFirst,
                  firstChild: const SizedBox.shrink(),
                  secondChild: _buildExpandedContent(order, data),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildExpandedContent(Order order, DataProvider data) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 14),
        const Text(
          'Order Items',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: AppColors.dark,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
          decoration: BoxDecoration(
            color: const Color(0xFFF6F7F9),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              const Row(
                children: [
                  SizedBox(
                    width: 24,
                    child: Text(
                      '#',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray600,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      'Item',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray600,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 36,
                    child: Text(
                      'Qty',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray600,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 60,
                    child: Text(
                      'Amount',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              for (var i = 0; i < order.items.length; i++)
                _buildItemRow(i + 1, order.items[i]),
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Subtotal',
                    style: TextStyle(color: AppColors.gray500, fontSize: 13.5),
                  ),
                  Text(
                    '₹${(order.totalAmount - order.taxAmount).toStringAsFixed(0)}',
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.gray700,
                    ),
                  ),
                ],
              ),
              if (order.taxAmount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Tax',
                        style:
                            TextStyle(color: AppColors.gray500, fontSize: 13.5),
                      ),
                      Text(
                        '₹${order.taxAmount.toStringAsFixed(0)}',
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.gray700,
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft.withOpacity(0.55),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Total',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                      ),
                    ),
                    Text(
                      '₹${order.totalAmount.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),
              if (order.paymentMethod != null) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.credit_card,
                            size: 16, color: AppColors.gray500),
                        SizedBox(width: 6),
                        Text(
                          'Payment Method',
                          style: TextStyle(
                            color: AppColors.gray500,
                            fontSize: 13.5,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      order.paymentMethod!.toUpperCase(),
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                        color: AppColors.dark,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (order.isCompleted) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Material(
                  color: AppColors.primarySoft.withOpacity(0.6),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => BillScreen(order: order),
                        ),
                      );
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.print,
                              size: 17, color: AppColors.primary),
                          SizedBox(width: 8),
                          Text(
                            'View Receipt',
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'cancel') {
                    _confirmCancelOrder(order, data);
                  }
                },
                position: PopupMenuPosition.under,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                color: Colors.white,
                itemBuilder: (context) => const [
                  PopupMenuItem<String>(
                    value: 'cancel',
                    child: Row(
                      children: [
                        Icon(Icons.cancel_outlined,
                            size: 18, color: AppColors.danger),
                        SizedBox(width: 8),
                        Text(
                          'Cancel Order',
                          style: TextStyle(
                            color: AppColors.danger,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.gray200,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.more_vert,
                    size: 18,
                    color: AppColors.gray600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildItemRow(int index, OrderItem orderItem) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Text(
              '$index',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.gray600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              orderItem.item.name,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.gray800,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          SizedBox(
            width: 36,
            child: Text(
              '${orderItem.quantity}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.gray700,
              ),
            ),
          ),
          SizedBox(
            width: 60,
            child: Text(
              '₹${orderItem.totalPrice.toStringAsFixed(0)}',
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.dark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCancelOrder(Order order, DataProvider data) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel Order?'),
        content: Text(
          'Are you sure you want to cancel this completed order for ${order.tableNumber == 0 ? 'Parcel Order' : order.tableLabel}?',
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

    if (confirm != true || !context.mounted) {
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => Center(
        child: CircularProgressIndicator(
          color: AppColors.primary,
        ),
      ),
    );

    try {
      final success = await data.cancelOrder(
        order.id,
      );

      if (context.mounted) {
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
      if (context.mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Error: ${e.toString()}',
            ),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }
}
