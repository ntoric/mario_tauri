import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/order.dart';
import '../models/table.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_timer.dart';
import 'order_screen.dart';

enum _OrderTypeFilter { all, dineIn, parcel, takeaway }

enum _OrderSortMode { newest, oldest, amountDesc, amountAsc }

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  _OrderTypeFilter _typeFilter = _OrderTypeFilter.all;
  _OrderSortMode _sortMode = _OrderSortMode.newest;
  String? _expandedOrderId;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  // Rotating card tints like the mock: orange, green, blue, purple.
  static final List<Color> _cardAccents = [
    AppColors.primary,
    AppColors.success,
    AppColors.info,
    Color(0xFF8E5BE0),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshOrders();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refreshOrders() async {
    final auth = context.read<AuthProvider>();
    if (auth.currentStore != null) {
      await context.read<DataProvider>().loadOrders(auth.currentStore!.id);
    }
  }

  _OrderTypeFilter _typeOf(Order order) {
    if (order.isParcelOrder) return _OrderTypeFilter.parcel;
    if (order.orderType == 'delivery' || order.orderType == 'takeaway') {
      return _OrderTypeFilter.takeaway;
    }
    return _OrderTypeFilter.dineIn;
  }

  bool _matchesFilter(Order order) {
    if (_typeFilter != _OrderTypeFilter.all && _typeOf(order) != _typeFilter) {
      return false;
    }
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return true;
    return order.tableLabel.toLowerCase().contains(query) ||
        order.id.toLowerCase().contains(query) ||
        order.orderTypeLabel.toLowerCase().contains(query) ||
        order.items.any((item) => item.item.name.toLowerCase().contains(query));
  }

  List<Order> _sortedOrders(List<Order> orders) {
    final sorted = List<Order>.of(orders);
    switch (_sortMode) {
      case _OrderSortMode.oldest:
        sorted.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      case _OrderSortMode.amountDesc:
        sorted.sort((a, b) => b.totalAmount.compareTo(a.totalAmount));
      case _OrderSortMode.amountAsc:
        sorted.sort((a, b) => a.totalAmount.compareTo(b.totalAmount));
      case _OrderSortMode.newest:
        sorted.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }
    return sorted;
  }

  Color _accentForIndex(int index) => _cardAccents[index % _cardAccents.length];

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeProvider>();
    final data = context.watch<DataProvider>();
    final activeOrders = data.activeOrders;
    final filteredOrders =
        _sortedOrders(activeOrders.where(_matchesFilter).toList());

    final dineInCount =
        activeOrders.where((o) => _typeOf(o) == _OrderTypeFilter.dineIn).length;
    final parcelCount =
        activeOrders.where((o) => _typeOf(o) == _OrderTypeFilter.parcel).length;
    final takeawayCount = activeOrders
        .where((o) => _typeOf(o) == _OrderTypeFilter.takeaway)
        .length;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Active Orders',
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Column(
              children: [
                _buildTypeFilters(
                  total: activeOrders.length,
                  dineIn: dineInCount,
                  parcel: parcelCount,
                  takeaway: takeawayCount,
                ),
                const SizedBox(height: 12),
                _buildSearchBar(),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshOrders,
              color: AppColors.primary,
              child: activeOrders.isEmpty
                  ? _buildEmptyState()
                  : filteredOrders.isEmpty
                      ? _buildNoResultsState()
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                          itemCount: filteredOrders.length,
                          itemBuilder: (context, index) {
                            final order = filteredOrders[index];
                            return _buildOrderCard(
                              order,
                              _accentForIndex(index),
                              data,
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTypeFilters({
    required int total,
    required int dineIn,
    required int parcel,
    required int takeaway,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _typePill(
            label: 'All',
            count: total,
            value: _OrderTypeFilter.all,
            icon: Icons.format_list_bulleted,
          ),
          const SizedBox(width: 8),
          _typePill(
            label: 'Dine In',
            count: dineIn,
            value: _OrderTypeFilter.dineIn,
            icon: Icons.restaurant,
          ),
          const SizedBox(width: 8),
          _typePill(
            label: 'Parcel',
            count: parcel,
            value: _OrderTypeFilter.parcel,
            icon: Icons.shopping_bag_outlined,
          ),
          const SizedBox(width: 8),
          _typePill(
            label: 'Takeaway',
            count: takeaway,
            value: _OrderTypeFilter.takeaway,
            icon: Icons.inventory_2_outlined,
          ),
        ],
      ),
    );
  }

  Widget _typePill({
    required String label,
    required int count,
    required _OrderTypeFilter value,
    required IconData icon,
  }) {
    final selected = _typeFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _typeFilter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(14),
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
            Icon(
              icon,
              size: 15,
              color: selected ? Colors.white : AppColors.gray600,
            ),
            const SizedBox(width: 6),
            Text(
              count > 0 ? '$label ($count)' : label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.gray700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBar() {
    return Row(
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.gray100,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.gray500.withOpacity(0.10),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: TextField(
              controller: _searchController,
              onChanged: (value) => setState(() => _searchQuery = value),
              decoration: InputDecoration(
                hintText: 'Search table, item or order...',
                hintStyle: TextStyle(
                  color: AppColors.gray400,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                prefixIcon: Icon(
                  Icons.search,
                  color: AppColors.gray400,
                  size: 20,
                ),
                suffixIcon: _searchQuery.isEmpty
                    ? null
                    : IconButton(
                        icon: Icon(Icons.close,
                            color: AppColors.gray400, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        GestureDetector(
          onTap: _showSortSheet,
          child: Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: AppColors.gray100,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppColors.gray500.withOpacity(0.10),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(
              Icons.tune,
              size: 20,
              color: _sortMode == _OrderSortMode.newest
                  ? AppColors.gray600
                  : AppColors.primary,
            ),
          ),
        ),
      ],
    );
  }

  void _showSortSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.gray100,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 8),
              child: Text(
                'Sort orders',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                ),
              ),
            ),
            _sortOption(sheetContext, 'Newest first', _OrderSortMode.newest),
            _sortOption(sheetContext, 'Oldest first', _OrderSortMode.oldest),
            _sortOption(
                sheetContext, 'Amount: high to low', _OrderSortMode.amountDesc),
            _sortOption(
                sheetContext, 'Amount: low to high', _OrderSortMode.amountAsc),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _sortOption(
      BuildContext sheetContext, String label, _OrderSortMode mode) {
    final selected = _sortMode == mode;
    return ListTile(
      title: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? AppColors.primary : AppColors.dark,
        ),
      ),
      trailing: selected
          ? Icon(Icons.check, color: AppColors.primary, size: 20)
          : null,
      onTap: () {
        setState(() => _sortMode = mode);
        Navigator.pop(sheetContext);
      },
    );
  }

  IconData _typeIcon(Order order) {
    switch (_typeOf(order)) {
      case _OrderTypeFilter.parcel:
        return Icons.shopping_bag_outlined;
      case _OrderTypeFilter.takeaway:
        return Icons.inventory_2_outlined;
      default:
        return Icons.restaurant;
    }
  }

  Widget _buildOrderCard(
    Order order,
    Color accent,
    DataProvider data,
  ) {
    final expanded = _expandedOrderId == order.id;
    final itemCount = order.items.length;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: AppColors.gray100,
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
                      width: 54,
                      height: 54,
                      decoration: BoxDecoration(
                        color: accent.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.table_restaurant, size: 19, color: accent),
                          const SizedBox(height: 2),
                          Text(
                            order.tableLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: accent,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.isDark
                                  ? AppColors.primary.withOpacity(0.18)
                                  : const Color(0xFFFFEDE6),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: OrderTimer(
                              order: order,
                              showIcon: true,
                              iconSize: 13,
                              color: AppColors.primaryDark,
                              textStyle: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryDark,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(_typeIcon(order),
                                  size: 13, color: AppColors.gray500),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  '$itemCount ${itemCount == 1 ? 'item' : 'items'} • ${order.orderTypeLabel}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.gray500,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '₹${order.totalAmount.toStringAsFixed(0)}',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      expanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      size: 22,
                      color: AppColors.gray700,
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
    final isParcel = order.isParcelOrder;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
          decoration: BoxDecoration(
            color: AppColors.backgroundSecondary,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  SizedBox(width: 44),
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
                    width: 52,
                    child: Text(
                      'Price',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.gray600,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 64,
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
              for (final orderItem in order.items) _buildItemRow(orderItem),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            if (!isParcel) ...[
              Expanded(
                child: _actionButton(
                  label: 'Edit Order',
                  icon: Icons.edit_outlined,
                  background: const Color(0xFFE3F0FF),
                  foreground: const Color(0xFF2F7FE0),
                  onTap: () => _editOrder(order, data),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _actionButton(
                  label: 'Move Table',
                  icon: Icons.swap_horiz,
                  background: const Color(0xFFFFF1D6),
                  foreground: const Color(0xFFB97A0A),
                  onTap: () => _showMoveTableDialog(order, data),
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: _actionButton(
                label: 'Cancel Order',
                icon: Icons.delete_outline,
                background: const Color(0xFFFDE8E8),
                foreground: AppColors.danger,
                onTap: () => _confirmCancelOrder(order, data),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildItemRow(OrderItem orderItem) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.primarySoft.withOpacity(0.6),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              Icons.fastfood_outlined,
              size: 17,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              orderItem.item.name,
              style: TextStyle(
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
              style: TextStyle(
                fontSize: 13,
                color: AppColors.gray700,
              ),
            ),
          ),
          SizedBox(
            width: 52,
            child: Text(
              '₹${(orderItem.unitPrice ?? orderItem.item.price).toStringAsFixed(0)}',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: AppColors.gray700,
              ),
            ),
          ),
          SizedBox(
            width: 64,
            child: Text(
              '₹${orderItem.totalPrice.toStringAsFixed(0)}',
              textAlign: TextAlign.right,
              style: TextStyle(
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

  Widget _actionButton({
    required String label,
    required IconData icon,
    required Color background,
    required Color foreground,
    required VoidCallback onTap,
  }) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: foreground),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: foreground,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _editOrder(Order order, DataProvider data) {
    final table = data.tables.where((t) => t.id == order.tableId).firstOrNull;
    if (table == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Table for this order was not found.'),
          backgroundColor: AppColors.danger,
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

  void _showMoveTableDialog(Order order, DataProvider data) {
    final parentContext = context;
    final availableTables = data.tables
        .where((t) =>
            t.id != order.tableId && t.isActive && !data.isTableOccupied(t.id))
        .toList();

    showDialog(
      context: parentContext,
      builder: (dialogContext) {
        return AlertDialog(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Move to Table'),
          content: SizedBox(
            width: double.maxFinite,
            child: availableTables.isEmpty
                ? Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No available tables right now.',
                      style: TextStyle(color: AppColors.gray500),
                    ),
                  )
                : GridView.builder(
                    shrinkWrap: true,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 1.1,
                    ),
                    itemCount: availableTables.length,
                    itemBuilder: (_, i) =>
                        _moveTableTile(availableTables[i], order, data),
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
          ],
        );
      },
    );
  }

  Widget _moveTableTile(TableModel table, Order order, DataProvider data) {
    return Material(
      color: AppColors.isDark
          ? AppColors.success.withOpacity(0.16)
          : const Color(0xFFE7F7EC),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          final navigator = Navigator.of(context);
          final messenger = ScaffoldMessenger.of(context);
          navigator.pop(); // close the table picker

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
            final success = await data.moveOrderToTable(
              order.id,
              table.id,
              table.number,
            );
            navigator.pop();
            messenger.showSnackBar(
              SnackBar(
                content: Text(
                  success
                      ? 'Order moved to ${table.label}'
                      : (data.error ?? 'Failed to move order.'),
                ),
                backgroundColor: success ? AppColors.success : AppColors.danger,
              ),
            );
          } catch (e) {
            navigator.pop();
            messenger.showSnackBar(
              SnackBar(
                content: Text('Error: ${e.toString()}'),
                backgroundColor: AppColors.danger,
              ),
            );
          }
        },
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              table.label,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.dark,
              ),
            ),
            Text(
              '${table.seats} seats',
              style: TextStyle(
                fontSize: 11,
                color: AppColors.gray500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancelOrder(Order order, DataProvider data) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel Order?'),
        content: Text(
          'Are you sure you want to cancel the order for ${order.isParcelOrder ? 'Parcel Order' : order.tableLabel}?',
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

    if (confirm != true || !context.mounted) return;

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
      final success = await data.cancelOrder(order.id);

      if (context.mounted) {
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
      if (context.mounted) {
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

  Widget _buildEmptyState() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.55,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 92,
                height: 92,
                decoration: ClayStyles.surface(
                  radiusValue: 28,
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppColors.gray100,
                      AppColors.primarySoft,
                    ],
                  ),
                ),
                child: Icon(
                  Icons.receipt_long_outlined,
                  size: 40,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'No active orders',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Create orders from the Tables tab',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.gray500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNoResultsState() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.4,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.search_off, size: 40, color: AppColors.gray400),
              SizedBox(height: 12),
              Text(
                'No orders match your filters',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppColors.gray500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
