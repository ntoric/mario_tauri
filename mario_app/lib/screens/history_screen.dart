import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
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
      setState(() {
        _selectedDateRange = picked;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final orders = data.orders.where((o) {
      if (o.status == 'active') {
        return false;
      }

      // 1. Status Filter
      if (_filterStatus != 'all' && o.status != _filterStatus) {
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
        if (o.createdAt.isBefore(start) || o.createdAt.isAfter(end)) {
          return false;
        }
      }

      // 3. Search Query Filter
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchesTable = o.tableNumber.toString() == query ||
            'table ${o.tableNumber}'.toLowerCase().contains(query);
        final matchesItems =
            o.items.any((item) => item.item.name.toLowerCase().contains(query));

        if (!matchesTable && !matchesItems) {
          return false;
        }
      }

      return true;
    }).toList();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppHeader(
        title: 'Order History',
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildFilterChip('All', 'all'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Completed', 'completed'),
                  const SizedBox(width: 8),
                  _buildFilterChip('Cancelled', 'cancelled'),
                ],
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.gray200,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: TextField(
                      decoration: const InputDecoration(
                        hintText: 'Search by table or item...',
                        prefixIcon: Icon(Icons.search),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      ),
                      onChanged: (value) {
                        setState(() {
                          _searchQuery = value;
                        });
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: _selectDateRange,
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _selectedDateRange != null
                            ? AppColors.primary.withOpacity(0.1)
                            : AppColors.gray200,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        Icons.calendar_today,
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
          ),
          if (_selectedDateRange != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${DateFormat('MM/dd').format(_selectedDateRange!.start)} - ${DateFormat('MM/dd').format(_selectedDateRange!.end)}',
                        style: const TextStyle(
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
                        },
                        child: const Icon(
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
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: orders.length,
                    itemBuilder: (context, index) {
                      final order = orders[index];
                      final dateFormat = DateFormat('MMM dd, yyyy HH:mm');

                      Color statusColor;
                      IconData statusIcon;
                      switch (order.status) {
                        case 'active':
                          statusColor = AppColors.primary;
                          statusIcon = Icons.hourglass_top;
                          break;
                        case 'completed':
                          statusColor = AppColors.success;
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
                          color: AppColors.light,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.dark.withOpacity(0.04),
                              blurRadius: 16,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: ExpansionTile(
                          shape: const Border(),
                          tilePadding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 4),
                          leading: Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: statusColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child:
                                Icon(statusIcon, color: statusColor, size: 24),
                          ),
                          title: Row(
                            children: [
                              Text(
                                order.tableNumber == 0
                                    ? 'Parcel Order'
                                    : 'Table ${order.tableNumber}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                  color: AppColors.dark,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: statusColor.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
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
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              dateFormat.format(order.createdAt),
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.gray500,
                              ),
                            ),
                          ),
                          trailing: Text(
                            '₹${order.totalAmount.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: AppColors.dark,
                              letterSpacing: -0.3,
                            ),
                          ),
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Order Items',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                      color: AppColors.gray700,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  ...order.items.map((item) {
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 6),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            '${item.quantity}x ${item.item.name}',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              color: AppColors.gray800,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                          Text(
                                            '₹${(item.item.price * item.quantity).toStringAsFixed(0)}',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 14,
                                              color: AppColors.dark,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }),
                                  const Divider(),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Text(
                                        'Subtotal',
                                        style: TextStyle(
                                            color: AppColors.gray500,
                                            fontSize: 14),
                                      ),
                                      Text(
                                        '₹${(order.totalAmount - order.taxAmount).toStringAsFixed(0)}',
                                        style: const TextStyle(
                                            fontSize: 14,
                                            color: AppColors.gray700),
                                      ),
                                    ],
                                  ),
                                  if (order.taxAmount > 0)
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Text(
                                          'Tax',
                                          style: TextStyle(
                                              color: AppColors.gray500,
                                              fontSize: 14),
                                        ),
                                        Text(
                                          '₹${order.taxAmount.toStringAsFixed(0)}',
                                          style: const TextStyle(
                                              fontSize: 14,
                                              color: AppColors.gray700),
                                        ),
                                      ],
                                    ),
                                  const SizedBox(height: 8),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      const Text(
                                        'Total',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 18,
                                          color: AppColors.dark,
                                        ),
                                      ),
                                      Text(
                                        '₹${order.totalAmount.toStringAsFixed(0)}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 20,
                                          color: AppColors.primary,
                                          letterSpacing: -0.3,
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (order.paymentMethod != null) ...[
                                    const SizedBox(height: 8),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Text(
                                          'Payment Method',
                                          style: TextStyle(
                                              color: AppColors.gray500,
                                              fontSize: 14),
                                        ),
                                        Text(
                                          order.paymentMethod!.toUpperCase(),
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 14,
                                            color: AppColors.gray700,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                  if (order.isCompleted) ...[
                                    const SizedBox(height: 16),
                                    SizedBox(
                                      width: double.infinity,
                                      child: OutlinedButton(
                                        onPressed: () async {
                                          final confirm =
                                              await showDialog<bool>(
                                            context: context,
                                            builder: (dialogContext) =>
                                                AlertDialog(
                                              title:
                                                  const Text('Cancel Order?'),
                                              content: Text(
                                                'Are you sure you want to cancel this completed order for ${order.tableNumber == 0 ? 'Parcel Order' : 'Table ${order.tableNumber}'}?',
                                              ),
                                              actions: [
                                                TextButton(
                                                  onPressed: () =>
                                                      Navigator.pop(
                                                    dialogContext,
                                                    false,
                                                  ),
                                                  child: const Text('No'),
                                                ),
                                                ElevatedButton(
                                                  onPressed: () =>
                                                      Navigator.pop(
                                                    dialogContext,
                                                    true,
                                                  ),
                                                  style:
                                                      ElevatedButton.styleFrom(
                                                    backgroundColor:
                                                        AppColors.danger,
                                                  ),
                                                  child: const Text(
                                                    'Yes, Cancel',
                                                  ),
                                                ),
                                              ],
                                            ),
                                          );

                                          if (confirm != true ||
                                              !context.mounted) {
                                            return;
                                          }

                                          showDialog(
                                            context: context,
                                            barrierDismissible: false,
                                            builder: (_) => const Center(
                                              child: CircularProgressIndicator(
                                                color: AppColors.primary,
                                              ),
                                            ),
                                          );

                                          try {
                                            final success =
                                                await data.cancelOrder(
                                              order.id,
                                            );

                                            if (context.mounted) {
                                              Navigator.pop(context);
                                              ScaffoldMessenger.of(context)
                                                  .showSnackBar(
                                                SnackBar(
                                                  content: Text(
                                                    success
                                                        ? 'Order cancelled successfully'
                                                        : (data.error ??
                                                            'Failed to cancel order.'),
                                                  ),
                                                  backgroundColor:
                                                      AppColors.danger,
                                                ),
                                              );
                                            }
                                          } catch (e) {
                                            if (context.mounted) {
                                              Navigator.pop(context);
                                              ScaffoldMessenger.of(context)
                                                  .showSnackBar(
                                                SnackBar(
                                                  content: Text(
                                                    'Error: ${e.toString()}',
                                                  ),
                                                  backgroundColor:
                                                      AppColors.danger,
                                                ),
                                              );
                                            }
                                          }
                                        },
                                        style: OutlinedButton.styleFrom(
                                          foregroundColor: AppColors.danger,
                                        ),
                                        child: const Text('Cancel Order'),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String value) {
    final isSelected = _filterStatus == value;
    return GestureDetector(
      onTap: () {
        setState(() {
          _filterStatus = value;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : AppColors.gray200,
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
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? AppColors.light : AppColors.primary,
          ),
        ),
      ),
    );
  }
}
