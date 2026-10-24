import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/table.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_timer.dart';
import '../widgets/order_table_actions.dart';
import '../widgets/tilt_3d_card.dart';
import '../main.dart';
import 'order_screen.dart';
import 'bill_screen.dart';

class TablesScreen extends StatefulWidget {
  const TablesScreen({super.key});

  @override
  State<TablesScreen> createState() => _TablesScreenState();
}

class _TablesScreenState extends State<TablesScreen> with RouteAware {
  WebSocket? _tableStatusSocket;
  StreamSubscription? _tableStatusSubscription;
  Timer? _wsReconnectTimer;
  Timer? _pollTimer;
  bool _isSocketActive = false;

  String? _sectionFilter;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshData();
      _startTableStatusRealtime();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route is PageRoute) {
      routeObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    routeObserver.unsubscribe(this);
    _stopTableStatusRealtime();
    super.dispose();
  }

  @override
  void didPopNext() {
    // Called when this route becomes visible again
    _refreshData();
    _startTableStatusRealtime();
  }

  @override
  void didPushNext() {
    // Called when navigating to another route
    _stopTableStatusRealtime();
  }

  void _startTableStatusRealtime() {
    _stopTableStatusRealtime();
    _isSocketActive = true;
    _startPolling();
    _connectTableStatusSocket();
  }

  void _stopTableStatusRealtime() {
    _isSocketActive = false;
    _wsReconnectTimer?.cancel();
    _wsReconnectTimer = null;
    _stopPolling();
    _tableStatusSubscription?.cancel();
    _tableStatusSubscription = null;
    _tableStatusSocket?.close();
    _tableStatusSocket = null;
  }

  // Polling fallback for when the websocket can't be established (e.g. an
  // edge proxy stripping Upgrade headers) — keeps table state fresh until
  // the socket connects, then goes quiet.
  void _startPolling() {
    _pollTimer ??= Timer.periodic(const Duration(seconds: 5), (_) {
      _silentRefreshData();
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _connectTableStatusSocket() async {
    if (!mounted || !_isSocketActive) return;

    final auth = context.read<AuthProvider>();
    final storeId = auth.currentStore?.id;
    final token = auth.backend.api.token;
    if (storeId == null || token == null || token.isEmpty) {
      return;
    }

    try {
      final baseUri = Uri.parse(auth.backend.api.baseUrl);
      final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
      final wsUri = Uri(
        scheme: wsScheme,
        host: baseUri.host,
        port: baseUri.hasPort ? baseUri.port : null,
        path: '/api/ws/tables-status',
        queryParameters: {
          'storeId': storeId,
          'token': token,
        },
      );

      _tableStatusSocket = await WebSocket.connect(wsUri.toString());
      _tableStatusSubscription = _tableStatusSocket!.listen(
        (event) async {
          if (!mounted) return;
          try {
            final message = jsonDecode(event as String);
            if (message is Map<String, dynamic> &&
                message['type'] == 'table_status_update') {
              await _silentRefreshData();
            }
          } catch (_) {
            // Ignore non-JSON/control frames.
          }
        },
        onDone: _scheduleWsReconnect,
        onError: (_) => _scheduleWsReconnect(),
        cancelOnError: true,
      );
      _stopPolling();
    } catch (_) {
      _scheduleWsReconnect();
    }
  }

  void _scheduleWsReconnect() {
    if (!_isSocketActive) return;
    _startPolling();
    _wsReconnectTimer?.cancel();
    _wsReconnectTimer = Timer(const Duration(seconds: 2), () {
      _connectTableStatusSocket();
    });
  }

  Future<void> _silentRefreshData() async {
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    if (auth.currentStore != null) {
      await context
          .read<DataProvider>()
          .silentUpdateTablesAndOrders(auth.currentStore!.id);
    }
  }

  Future<void> _refreshData() async {
    final auth = context.read<AuthProvider>();
    if (auth.currentStore != null) {
      await context.read<DataProvider>().loadTables(auth.currentStore!.id);
      await context
          .read<DataProvider>()
          .loadTableSections(auth.currentStore!.id);
      await context.read<DataProvider>().loadOrders(auth.currentStore!.id);
    }
  }

  void _showTableOptions(TableModel table, Order? order, DataProvider data) {
    final parentContext = context;
    final auth = parentContext.read<AuthProvider>();
    final isOccupied = order != null;

    showModalBottomSheet(
      context: parentContext,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) => SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.gray100,
                AppColors.backgroundSecondary,
              ],
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            border: Border(
              top: BorderSide(
                color: Colors.white.withOpacity(AppColors.isDark ? 0.08 : 0.7),
              ),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 42,
                height: 5,
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 14),

              // Header: table tile + info + amount/duration card
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 62,
                    height: 62,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: isOccupied
                            ? [AppColors.primary, AppColors.primaryDark]
                            : [
                                AppColors.primarySoft.withOpacity(0.8),
                                AppColors.primarySoft.withOpacity(0.4),
                              ],
                      ),
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: isOccupied
                          ? [
                              BoxShadow(
                                color: AppColors.primary.withOpacity(0.35),
                                blurRadius: 14,
                                offset: const Offset(0, 5),
                              ),
                            ]
                          : null,
                    ),
                    child: Icon(
                      Icons.table_restaurant,
                      size: 32,
                      color: isOccupied ? Colors.white : AppColors.gray500,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          table.label,
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          '${table.seats} seats',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.gray500,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: isOccupied
                                ? AppColors.primary.withOpacity(0.12)
                                : AppColors.success.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isOccupied
                                    ? Icons.people
                                    : Icons.check_circle_outline,
                                size: 12,
                                color: isOccupied
                                    ? AppColors.primary
                                    : AppColors.success,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                isOccupied ? 'Occupied' : 'Available',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                  color: isOccupied
                                      ? AppColors.primary
                                      : AppColors.success,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (order != null)
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.backgroundSecondary,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppColors.gray300.withOpacity(0.5),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.credit_card,
                                  size: 13, color: AppColors.gray500),
                              SizedBox(width: 5),
                              Text(
                                'Current Amount',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: AppColors.gray500,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '₹${order.totalAmount.toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(height: 6),
                          OrderTimer(
                            order: order,
                            showIcon: true,
                            iconSize: 12,
                            textStyle: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                          ),
                          Text(
                            'Order duration',
                            style: TextStyle(
                              fontSize: 9.5,
                              color: AppColors.gray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),

              if (!isOccupied) ...[
                const SizedBox(height: 16),
                _sheetRowCard(
                  icon: Icons.add_circle,
                  iconColor: AppColors.primary,
                  iconBg: AppColors.primarySoft.withOpacity(0.7),
                  title: 'Create Order',
                  subtitle: 'Start a new dine-in order',
                  onTap: () {
                    Navigator.pop(sheetContext);
                    Navigator.push(
                      parentContext,
                      MaterialPageRoute(
                        builder: (_) =>
                            OrderScreen(table: table, isNewOrder: true),
                      ),
                    );
                  },
                ),
              ],

              if (isOccupied) ...[
                const SizedBox(height: 14),

                // Order Summary row
                _sheetRowCard(
                  icon: Icons.description_outlined,
                  iconColor: AppColors.info,
                  iconBg: AppColors.info.withOpacity(0.12),
                  title: 'Order Summary',
                  subtitle: 'View items, quantities, discounts and total',
                  onTap: () => _showOrderSummarySheet(order),
                ),
                const SizedBox(height: 10),

                // 3 action cards
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: _actionCard(
                          bg: const Color(0xFFEAF2FF),
                          accent: AppColors.info,
                          icon: Icons.edit,
                          title: 'Edit Order',
                          desc: 'Add, remove or modify items',
                          onTap: () {
                            Navigator.pop(sheetContext);
                            Navigator.push(
                              parentContext,
                              MaterialPageRoute(
                                builder: (_) => OrderScreen(
                                  table: table,
                                  order: order,
                                  isNewOrder: false,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _actionCard(
                          bg: const Color(0xFFFFF4DB),
                          accent: AppColors.warning,
                          icon: Icons.swap_horiz,
                          title: 'Move to Another Table',
                          desc: 'Transfer this order to a different table',
                          onTap: () {
                            Navigator.pop(sheetContext);
                            showMoveTableDialog(
                                parentContext, order, data.tables, data);
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _actionCard(
                          bg: const Color(0xFFFFEAEA),
                          accent: AppColors.danger,
                          icon: Icons.delete_outline,
                          title: 'Cancel Order',
                          desc: 'Cancel this order permanently',
                          titleColor: AppColors.danger,
                          onTap: () {
                            Navigator.pop(sheetContext);
                            cancelOrderFlow(parentContext, order, data);
                          },
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Quick Actions
                Row(
                  children: [
                    Text(
                      'Quick Actions',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => Navigator.pop(sheetContext),
                      child: Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: AppColors.gray200,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.close,
                          size: 14,
                          color: AppColors.gray600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _quickAction(
                        icon: Icons.person_add_alt_outlined,
                        label: 'Add Customer',
                        onTap: () {
                          Navigator.pop(sheetContext);
                          _showAddCustomerDialog(order, data);
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _quickAction(
                        icon: Icons.print_outlined,
                        label: 'Print Bill',
                        onTap: () {
                          Navigator.pop(sheetContext);
                          if (auth.currentStore?.remoteBillingEnabled == true) {
                            Navigator.push(
                              parentContext,
                              MaterialPageRoute(
                                builder: (_) => BillScreen(order: order),
                              ),
                            );
                          } else {
                            ScaffoldMessenger.of(parentContext).showSnackBar(
                              const SnackBar(
                                content: Text(
                                    'Remote billing is not enabled for this store'),
                                backgroundColor: AppColors.warning,
                              ),
                            );
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _quickAction(
                        icon: Icons.merge_type,
                        label: 'Merge Bill',
                        onTap: () {
                          Navigator.pop(sheetContext);
                          showMergeBillDialog(
                              parentContext, order, data.tables, data);
                        },
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 14),

              // Close button
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  onPressed: () => Navigator.pop(sheetContext),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text(
                    'Close',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  style: TextButton.styleFrom(
                    backgroundColor: AppColors.gray200,
                    foregroundColor: AppColors.gray700,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
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

  Widget _sheetRowCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: AppColors.gray100,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray300.withOpacity(0.55)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 19),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 10.5,
                        color: AppColors.gray500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: AppColors.gray500),
            ],
          ),
        ),
      ),
    );
  }

  Widget _actionCard({
    required Color bg,
    required Color accent,
    required IconData icon,
    required String title,
    required String desc,
    required VoidCallback onTap,
    Color? titleColor,
  }) {
    return Material(
      color: AppColors.isDark ? accent.withOpacity(0.13) : bg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.16),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: accent),
              ),
              const SizedBox(height: 8),
              Text(
                title,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: titleColor ?? AppColors.dark,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                desc,
                maxLines: 2,
                style: TextStyle(
                  fontSize: 9.5,
                  height: 1.25,
                  color: AppColors.gray600,
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: accent.withOpacity(0.16),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.chevron_right, size: 13, color: accent),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _quickAction({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return Material(
      color: AppColors.gray100,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.gray300.withOpacity(0.55)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 15, color: AppColors.dark),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.dark,
                  ),
                ),
              ),
              Icon(Icons.chevron_right, size: 14, color: AppColors.gray500),
            ],
          ),
        ),
      ),
    );
  }

  void _showOrderSummarySheet(Order order) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SafeArea(
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.7,
          ),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.gray100,
                AppColors.backgroundSecondary,
              ],
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
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
              const SizedBox(height: 14),
              Text(
                'Order Summary',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: order.items.length,
                  separatorBuilder: (_, __) =>
                      Divider(height: 16, color: AppColors.gray200),
                  itemBuilder: (_, i) {
                    final oi = order.items[i];
                    return Row(
                      children: [
                        Expanded(
                          child: Text(
                            oi.item.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.dark,
                            ),
                          ),
                        ),
                        Text(
                          '× ${oi.quantity}',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: AppColors.gray500,
                          ),
                        ),
                        const SizedBox(width: 14),
                        SizedBox(
                          width: 72,
                          child: Text(
                            '₹${oi.totalPrice.toStringAsFixed(2)}',
                            textAlign: TextAlign.right,
                            style: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              Divider(height: 24, color: AppColors.gray200),
              _summaryLine('Subtotal', order.subtotal),
              if (order.discountAmount > 0) ...[
                const SizedBox(height: 6),
                _summaryLine('Discount', -order.discountAmount),
              ],
              const SizedBox(height: 6),
              _summaryLine('Tax', order.taxAmount),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Total',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                  Text(
                    '₹${order.totalAmount.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _summaryLine(String label, double amount) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13, color: AppColors.gray600),
        ),
        Text(
          '₹${amount.toStringAsFixed(2)}',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.dark,
          ),
        ),
      ],
    );
  }

  void _showAddCustomerDialog(Order order, DataProvider data) {
    final nameController =
        TextEditingController(text: order.customerName ?? '');
    final mobileController =
        TextEditingController(text: order.customerMobile ?? '');

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Customer Details'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Customer Name',
                hintText: 'e.g. Ravi Kumar',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: mobileController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Mobile Number',
                hintText: 'e.g. 9876543210',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final navigator = Navigator.of(dialogContext);
              final messenger = ScaffoldMessenger.of(context);
              navigator.pop();

              final updated = await data.updateOrder(
                orderId: order.id,
                customerName: nameController.text.trim(),
                customerMobile: mobileController.text.trim(),
              );

              messenger.showSnackBar(
                SnackBar(
                  content: Text(
                    updated != null
                        ? 'Customer details saved'
                        : (data.error ?? 'Failed to save customer'),
                  ),
                  backgroundColor:
                      updated != null ? AppColors.success : AppColors.danger,
                ),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  _TableStatusFilter _statusFor(TableModel table, DataProvider data) {
    if (data.isTableOccupied(table.id)) return _TableStatusFilter.occupied;
    return table.isActive
        ? _TableStatusFilter.available
        : _TableStatusFilter.reserved;
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthProvider>();
    context.watch<ThemeProvider>();
    final data = context.watch<DataProvider>();
    final tables = data.tables;

    // Section grouping — mirrors the desktop app: the flagged default section
    // (or the "Section 1" fallback) buckets tables with no explicit section.
    final sectionCounts = <String, int>{};
    for (final t in tables) {
      final name = data.sectionNameOf(t);
      sectionCounts[name] = (sectionCounts[name] ?? 0) + 1;
    }
    final pillSections = data.sectionNames
        .where((name) => (sectionCounts[name] ?? 0) > 0)
        .toList();
    // A stale selection (e.g. its last table moved) falls back to "all".
    final activeSection = _sectionFilter != null &&
            (sectionCounts[_sectionFilter] ?? 0) > 0
        ? _sectionFilter
        : null;

    final filteredTables = tables
        .where((t) =>
            activeSection == null || data.sectionNameOf(t) == activeSection)
        .toList()
      ..sort((a, b) => a.number.compareTo(b.number));
    final groupedTables = [
      for (final name in data.sectionNames)
        if (activeSection == null || name == activeSection)
          (
            name: name,
            tables: filteredTables
                .where((t) => data.sectionNameOf(t) == name)
                .toList()
          ),
    ]..removeWhere((g) => g.tables.isEmpty);
    final crossAxisCount = ResponsiveHelper.getGridCrossAxisCount(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Tables',
      ),
      body: Column(
        children: [
          if (pillSections.length > 1) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: _buildSectionPills(
                total: tables.length,
                sections: pillSections,
                counts: sectionCounts,
                active: activeSection,
              ),
            ),
            const SizedBox(height: 14),
          ] else
            const SizedBox(height: 4),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshData,
              color: AppColors.primary,
              child: tables.isEmpty
                  ? _buildEmptyState()
                  : filteredTables.isEmpty
                      ? _buildNoResultsState()
                      : SingleChildScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 110),
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              const spacing = 12.0;
                              final cardWidth = (constraints.maxWidth -
                                      spacing * (crossAxisCount - 1)) /
                                  crossAxisCount;
                              var cardIndex = 0;
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  for (var g = 0;
                                      g < groupedTables.length;
                                      g++) ...[
                                    if (g > 0) const SizedBox(height: 18),
                                    if (activeSection == null)
                                      _buildSectionHeader(
                                        groupedTables[g].name,
                                        groupedTables[g].tables.length,
                                      ),
                                    Wrap(
                                      spacing: spacing,
                                      runSpacing: spacing,
                                      children: [
                                        for (final table
                                            in groupedTables[g].tables)
                                          SizedBox(
                                            width: cardWidth,
                                            height: 182,
                                            child: _buildTableCard(
                                                table, data, cardIndex++),
                                          ),
                                      ],
                                    ),
                                  ],
                                ],
                              );
                            },
                          ),
                        ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionPills({
    required int total,
    required List<String> sections,
    required Map<String, int> counts,
    required String? active,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _filterPill(
            icon: Icons.grid_view_rounded,
            label: 'All',
            count: total,
            selected: active == null,
            accent: AppColors.primary,
            onTap: () => setState(() => _sectionFilter = null),
          ),
          for (final name in sections) ...[
            const SizedBox(width: 8),
            _filterPill(
              icon: Icons.layers_outlined,
              label: name,
              count: counts[name] ?? 0,
              selected: active == name,
              accent: AppColors.primary,
              onTap: () => setState(
                  () => _sectionFilter = active == name ? null : name),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String name, int count) {
    final isDark = AppColors.isDark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(
            Icons.layers_outlined,
            size: 15,
            color: AppColors.gray500,
          ),
          const SizedBox(width: 6),
          Text(
            name,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
              color: AppColors.dark,
            ),
          ),
          const SizedBox(width: 7),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(isDark ? 0.18 : 0.10),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Text(
              '$count',
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                color: AppColors.primary,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Divider(
              height: 1,
              color: AppColors.gray300.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterPill({
    required IconData icon,
    required String label,
    required int count,
    required bool selected,
    required Color accent,
    required VoidCallback onTap,
  }) {
    final isDark = AppColors.isDark;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        decoration: BoxDecoration(
          gradient: selected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    accent,
                    Color.lerp(accent, Colors.black, 0.18)!,
                  ],
                )
              : null,
          color: selected ? null : AppColors.gray100,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? Colors.transparent
                : AppColors.gray300.withOpacity(0.8),
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: accent.withOpacity(isDark ? 0.4 : 0.3),
                    blurRadius: 14,
                    offset: const Offset(0, 5),
                  ),
                ]
              : [
                  BoxShadow(
                    color: AppColors.dark.withOpacity(isDark ? 0.2 : 0.05),
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
            const SizedBox(width: 7),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.1,
                color: selected ? Colors.white : AppColors.gray700,
              ),
            ),
            const SizedBox(width: 7),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: selected
                    ? Colors.white.withOpacity(0.22)
                    : accent.withOpacity(isDark ? 0.18 : 0.12),
                borderRadius: BorderRadius.circular(7),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: selected ? Colors.white : accent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTableCard(TableModel table, DataProvider data, int index) {
    final order = data.getOrderForTable(table.id);
    final status = _statusFor(table, data);
    final isOccupied = status == _TableStatusFilter.occupied;
    final isReserved = status == _TableStatusFilter.reserved;

    final Color accent;
    final String statusLabel;
    if (isOccupied) {
      accent = AppColors.primary;
      statusLabel = 'Occupied';
    } else if (isReserved) {
      accent = AppColors.info;
      statusLabel = 'Reserved';
    } else {
      accent = AppColors.success;
      statusLabel = 'Available';
    }

    final isDark = AppColors.isDark;

    return _StaggeredIn(
      index: index,
      child: Tilt3DCard(
        tilt: 0.05,
        scaleDown: 0.03,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              if (isReserved) {
                _showTableOptions(table, order, data);
                return;
              }
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => OrderScreen(
                    table: table,
                    order: order,
                    isNewOrder: order == null,
                  ),
                ),
              );
            },
            onLongPress: () => _showTableOptions(table, order, data),
            borderRadius: BorderRadius.circular(22),
            child: Container(
              height: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color.lerp(AppColors.gray100, accent,
                        isDark ? 0.22 : (isOccupied ? 0.16 : 0.10))!,
                    Color.lerp(
                        AppColors.gray100, accent, isDark ? 0.05 : 0.02)!,
                  ],
                ),
                border: Border.all(
                  color: accent.withOpacity(isDark ? 0.35 : 0.25),
                  width: 1.2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: accent.withOpacity(isDark ? 0.25 : 0.16),
                    blurRadius: 20,
                    offset: const Offset(0, 8),
                  ),
                  BoxShadow(
                    color: AppColors.dark.withOpacity(isDark ? 0.25 : 0.05),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                children: [
                  const SizedBox(height: 12),
                  // Occupied cards show the elapsed timer centered; other
                  // statuses show a dot-less badge in the same slot.
                  if (isOccupied)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: accent.withOpacity(isDark ? 0.20 : 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: OrderTimer(
                        order: order!,
                        showIcon: true,
                        iconSize: 11,
                        color: accent,
                        textStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: accent,
                          letterSpacing: 0.4,
                        ),
                      ),
                    )
                  else
                    _statusChip(accent: accent, label: statusLabel),
                  const SizedBox(height: 12),
                  Text(
                    (table.name != null && table.name!.isNotEmpty)
                        ? table.name!
                        : '${table.number}',
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.6,
                      height: 1.05,
                      color: AppColors.dark,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${table.seats} ${table.seats == 1 ? 'seat' : 'seats'}',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.gray500,
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (!isOccupied) ...[
                    const Spacer(),
                    if (isReserved)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.schedule_rounded,
                              size: 13,
                              color: accent,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'View options',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: accent,
                                letterSpacing: 0.1,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                  if (isOccupied) ...[
                    Text(
                      '₹${order!.totalAmount.toStringAsFixed(0)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                        letterSpacing: -0.3,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    const SizedBox(height: 10),
                    Container(
                      decoration: BoxDecoration(
                        border: Border(
                          top: BorderSide(
                            color: accent.withOpacity(0.18),
                          ),
                        ),
                      ),
                      child: IntrinsicHeight(
                        child: Row(
                          children: [
                            _cardAction(
                              icon: Icons.receipt_long_outlined,
                              color: AppColors.dark,
                              onTap: () {
                                final remoteBilling = context
                                        .read<AuthProvider>()
                                        .currentStore
                                        ?.remoteBillingEnabled ==
                                    true;
                                if (remoteBilling) {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => BillScreen(order: order),
                                    ),
                                  );
                                } else {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                          'Remote billing is not enabled for this store'),
                                      backgroundColor: AppColors.warning,
                                    ),
                                  );
                                }
                              },
                            ),
                            _cardAction(
                              icon: Icons.swap_horiz_rounded,
                              color: AppColors.dark,
                              onTap: () => showMoveTableDialog(
                                  context, order, data.tables, data),
                            ),
                            _cardAction(
                              icon: Icons.close_rounded,
                              color: AppColors.danger,
                              onTap: () =>
                                  cancelOrderFlow(context, order, data),
                              isLast: true,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _statusChip({
    required Color accent,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: accent.withOpacity(AppColors.isDark ? 0.20 : 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          color: accent,
          letterSpacing: 0.8,
        ),
      ),
    );
  }

  Widget _cardAction({
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
    bool isLast = false,
  }) {
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          height: 44,
          decoration: BoxDecoration(
            border: isLast
                ? null
                : Border(
                    right: BorderSide(
                      color: AppColors.dark.withOpacity(0.08),
                    ),
                  ),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.5,
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
                  Icons.table_restaurant_outlined,
                  size: 40,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'No tables available yet',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Pull to refresh after tables are synced from the store',
                style: TextStyle(
                  color: AppColors.gray500,
                  fontSize: 14,
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
                'No tables match your filters',
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

enum _TableStatusFilter { occupied, available, reserved }

/// Fades + slides a child in on first build, delayed by its grid index, for a
/// staggered entrance when the grid first appears.
class _StaggeredIn extends StatefulWidget {
  final int index;
  final Widget child;

  const _StaggeredIn({required this.index, required this.child});

  @override
  State<_StaggeredIn> createState() => _StaggeredInState();
}

class _StaggeredInState extends State<_StaggeredIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 450),
  );
  late final Animation<double> _anim = CurvedAnimation(
    parent: _controller,
    curve: Curves.easeOutCubic,
  );

  @override
  void initState() {
    super.initState();
    Future.delayed(
      Duration(milliseconds: 40 * widget.index.clamp(0, 14)),
      () {
        if (mounted) _controller.forward();
      },
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      child: widget.child,
      builder: (context, child) {
        return Opacity(
          opacity: _anim.value,
          child: Transform.translate(
            offset: Offset(0, 14 * (1 - _anim.value)),
            child: child,
          ),
        );
      },
    );
  }
}
