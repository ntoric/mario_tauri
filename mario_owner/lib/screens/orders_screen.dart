import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';
import '../widgets/period_filter.dart';
import '../widgets/store_picker_button.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  String _filterStatus = 'all';
  String _searchQuery = '';
  DateTimeRange? _selectedDateRange;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        context.read<DataProvider>().loadOrders(auth.currentStore!.id);
      }
    });
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
      setState(() => _selectedDateRange = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final orders = data.filteredOrders.where((o) {
      if (_filterStatus != 'all' && o.status != _filterStatus) return false;

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
          23, 59, 59,
        );
        if (o.createdAt.isBefore(start) || o.createdAt.isAfter(end)) return false;
      }

      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchesTable = o.tableNumber.toString() == query ||
            'table ${o.tableNumber}'.toLowerCase().contains(query);
        final matchesItems = o.items.any(
            (item) => item.item.name.toLowerCase().contains(query));
        if (!matchesTable && !matchesItems) return false;
      }

      return true;
    }).toList();

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: AppColors.background,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
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
                      child: const Icon(Icons.receipt_rounded,
                          color: AppColors.primary, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Orders',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const Spacer(),
                    const StorePickerButton(),
                  ],
                ),
              ),
            ),
          ),
          Container(
            color: AppColors.gray50,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildFilterChip('All', 'all'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Active', 'active'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Completed', 'completed'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Cancelled', 'cancelled'),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.gray100,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: TextField(
                      decoration: const InputDecoration(
                        hintText: 'Search by table or item...',
                        prefixIcon: Icon(Icons.search_rounded),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      ),
                      onChanged: (value) =>
                          setState(() => _searchQuery = value),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                _buildDateButton(),
              ],
            ),
          ),
          PeriodFilterBar(
            selected: data.periodFilter,
            onChanged: (p) => data.setPeriodFilter(p),
          ),
          Expanded(
            child: orders.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.history_rounded,
                            size: 72, color: AppColors.gray300),
                        const SizedBox(height: 16),
                        Text('No orders found',
                            style: TextStyle(
                                fontSize: 16, color: AppColors.gray400)),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      return StaggeredAnimation(
                        index: index.clamp(0, 8),
                        child: _buildOrderCard(order),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildOrderCard(order) {
    final dateFormat = DateFormat('MMM dd, yyyy \u2022 HH:mm');
    Color statusColor;
    IconData statusIcon;
    Gradient? statusGradient;

    switch (order.status) {
      case 'active':
        statusColor = AppColors.warning;
        statusIcon = Icons.hourglass_top_rounded;
        statusGradient = AppColors.warningGradient;
        break;
      case 'completed':
        statusColor = AppColors.success;
        statusIcon = Icons.check_circle_rounded;
        statusGradient = AppColors.successGradient;
        break;
      case 'cancelled':
        statusColor = AppColors.danger;
        statusIcon = Icons.cancel_rounded;
        statusGradient = AppColors.dangerGradient;
        break;
      default:
        statusColor = AppColors.gray600;
        statusIcon = Icons.help_rounded;
        statusGradient = null;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      child: ExpansionTile(
        shape: const Border(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            gradient: statusGradient,
            color: statusGradient == null ? statusColor : null,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(statusIcon, color: Colors.white, size: 24),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                order.tableNumber == 0
                    ? 'Parcel Order'
                    : 'Table ${order.tableNumber}',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                order.status.toUpperCase(),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: statusColor,
                ),
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            dateFormat.format(order.createdAt),
            style: const TextStyle(fontSize: 12, color: AppColors.gray500),
          ),
        ),
        trailing: Text(
          '\u20B9${order.totalAmount.toStringAsFixed(0)}',
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.primary,
          ),
        ),
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Order Items',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 10),
                ...order.items.map((item) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${item.quantity}x ${item.item.name}',
                              style: const TextStyle(fontSize: 14)),
                          Text(
                            '\u20B9${(item.item.price * item.quantity).toStringAsFixed(2)}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14),
                          ),
                        ],
                      ),
                    )),
                const Divider(height: 20),
                _buildDetailRow(
                    'Subtotal',
                    '\u20B9${(order.totalAmount - order.taxAmount).toStringAsFixed(2)}'),
                if (order.taxAmount > 0)
                  _buildDetailRow('Tax',
                      '\u20B9${order.taxAmount.toStringAsFixed(2)}'),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
                    Text(
                      '\u20B9${order.totalAmount.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
                if (order.paymentMethod != null) ...[
                  const SizedBox(height: 8),
                  _buildDetailRow('Payment Method',
                      order.paymentMethod!.toUpperCase()),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.gray500, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildDateButton() {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _selectDateRange,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: AppAnimations.fast,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(
              color: _selectedDateRange != null
                  ? AppColors.primary
                  : AppColors.gray300,
            ),
            borderRadius: BorderRadius.circular(14),
            color: _selectedDateRange != null
                ? AppColors.primaryExtraLight
                : Colors.transparent,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.calendar_today_rounded,
                size: 18,
                color: _selectedDateRange != null
                    ? AppColors.primary
                    : AppColors.gray500,
              ),
              if (_selectedDateRange != null) ...[
                const SizedBox(width: 8),
                Text(
                  '${DateFormat('MM/dd').format(_selectedDateRange!.start)} - ${DateFormat('MM/dd').format(_selectedDateRange!.end)}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: () => setState(() => _selectedDateRange = null),
                  child: const Icon(Icons.close_rounded,
                      size: 16, color: AppColors.primary),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _filterStatus == value;
    return GestureDetector(
      onTap: () => setState(() => _filterStatus = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : AppColors.gray100,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.transparent),
          boxShadow: [
            BoxShadow(
              color: isSelected
                  ? AppColors.primary.withOpacity(0.4)
                  : AppColors.dark.withOpacity(0.15),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
            color: isSelected ? Colors.white : AppColors.primary,
          ),
        ),
      ),
    );
  }
}
