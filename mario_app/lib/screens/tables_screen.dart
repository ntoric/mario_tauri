import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../models/table.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_timer.dart';
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
  bool _isSocketActive = false;

  _TableStatusFilter _statusFilter = _TableStatusFilter.all;

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
    _connectTableStatusSocket();
  }

  void _stopTableStatusRealtime() {
    _isSocketActive = false;
    _wsReconnectTimer?.cancel();
    _wsReconnectTimer = null;
    _tableStatusSubscription?.cancel();
    _tableStatusSubscription = null;
    _tableStatusSocket?.close();
    _tableStatusSocket = null;
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
    } catch (_) {
      _scheduleWsReconnect();
    }
  }

  void _scheduleWsReconnect() {
    if (!_isSocketActive) return;
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
      await context.read<DataProvider>().loadOrders(auth.currentStore!.id);
    }
  }

  void _showChangeTableDialog(
      Order order, List<TableModel> tables, DataProvider data) {
    final parentContext = context;
    final availableTables = tables
        .where((t) => t.id != order.tableId && !data.isTableOccupied(t.id))
        .toList();

    if (availableTables.isEmpty) {
      ScaffoldMessenger.of(parentContext).showSnackBar(
        const SnackBar(
          content: Text('No available tables to move to'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    showDialog(
      context: parentContext,
      builder: (dialogContext) {
        final navigator = Navigator.of(parentContext);
        final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

        return AlertDialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.symmetric(horizontal: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          contentPadding: EdgeInsets.zero,
          titlePadding: EdgeInsets.zero,
          content: Container(
            width: double.maxFinite,
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
            decoration: ClayStyles.surface(radiusValue: 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Move Order to Table',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Choose a free table for this active order',
                  style: TextStyle(
                    color: AppColors.gray500,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 18),
                GridView.builder(
                  shrinkWrap: true,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 1,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: availableTables.length,
                  itemBuilder: (itemBuilderContext, index) {
                    final table = availableTables[index];
                    return InkWell(
                      onTap: () async {
                        Navigator.pop(dialogContext);

                        showDialog(
                          context: navigator.context,
                          barrierDismissible: false,
                          builder: (loadingContext) => Center(
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

                          if (success) {
                            scaffoldMessenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                    'Order moved to ${table.label}'),
                                backgroundColor: AppColors.success,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            );
                          } else {
                            scaffoldMessenger.showSnackBar(
                              SnackBar(
                                content:
                                    Text(data.error ?? 'Failed to move order.'),
                                backgroundColor: AppColors.danger,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            );
                          }
                        } catch (e) {
                          navigator.pop();
                          scaffoldMessenger.showSnackBar(
                            SnackBar(
                              content: Text('Error: ${e.toString()}'),
                              backgroundColor: AppColors.danger,
                              behavior: SnackBarBehavior.floating,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          );
                        }
                      },
                      borderRadius: ClayStyles.radius(18),
                      child: Container(
                        decoration: ClayStyles.surface(
                          radiusValue: 18,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Colors.white,
                              AppColors.clayBlue.withOpacity(0.65),
                            ],
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              table.label,
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                            Text(
                              '${table.seats} seats',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.gray500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Cancel'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showCombineTableDialog(
      Order order, List<TableModel> tables, DataProvider data) {
    final parentContext = context;
    // Only tables with an active order can be merged into this one.
    final occupiedTables = tables
        .where((t) => t.id != order.tableId && data.isTableOccupied(t.id))
        .toList();

    if (occupiedTables.isEmpty) {
      ScaffoldMessenger.of(parentContext).showSnackBar(
        const SnackBar(
          content: Text('No other occupied tables to merge with'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    showDialog(
      context: parentContext,
      builder: (dialogContext) {
        final navigator = Navigator.of(parentContext);
        final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

        return AlertDialog(
          backgroundColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.symmetric(horizontal: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          contentPadding: EdgeInsets.zero,
          titlePadding: EdgeInsets.zero,
          content: Container(
            width: double.maxFinite,
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
            decoration: ClayStyles.surface(radiusValue: 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Merge Bill',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Pick an occupied table — its order merges into ${order.tableLabel} and the table is freed',
                  style: const TextStyle(
                    color: AppColors.gray500,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 18),
                GridView.builder(
                  shrinkWrap: true,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 1,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: occupiedTables.length,
                  itemBuilder: (itemBuilderContext, index) {
                    final table = occupiedTables[index];
                    final otherOrder = data.getOrderForTable(table.id);
                    return InkWell(
                      onTap: () async {
                        if (otherOrder == null) return;
                        Navigator.pop(dialogContext);

                        showDialog(
                          context: navigator.context,
                          barrierDismissible: false,
                          builder: (loadingContext) => Center(
                            child: CircularProgressIndicator(
                              color: AppColors.primary,
                            ),
                          ),
                        );

                        try {
                          final merged = await data.mergeOrders(
                            order.id,
                            otherOrder.id,
                          );

                          navigator.pop();

                          if (merged != null) {
                            scaffoldMessenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                    '${table.label} order merged — table freed'),
                                backgroundColor: AppColors.success,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            );
                          } else {
                            scaffoldMessenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                    data.error ?? 'Failed to merge orders.'),
                                backgroundColor: AppColors.danger,
                                behavior: SnackBarBehavior.floating,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            );
                          }
                        } catch (e) {
                          navigator.pop();
                          scaffoldMessenger.showSnackBar(
                            SnackBar(
                              content: Text('Error: ${e.toString()}'),
                              backgroundColor: AppColors.danger,
                              behavior: SnackBarBehavior.floating,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          );
                        }
                      },
                      borderRadius: ClayStyles.radius(18),
                      child: Container(
                        decoration: ClayStyles.surface(
                          radiusValue: 18,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Colors.white,
                              AppColors.clayBlue.withOpacity(0.65),
                            ],
                          ),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              table.label,
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                            Text(
                              '₹${(otherOrder?.totalAmount ?? 0).toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.gray500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.pop(dialogContext),
                    child: const Text('Cancel'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
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
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
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
                      color: AppColors.primarySoft.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      Icons.table_restaurant,
                      size: 32,
                      color: isOccupied
                          ? AppColors.primary
                          : AppColors.gray500,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          table.label,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          '${table.seats} seats',
                          style: const TextStyle(
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
                        color: AppColors.gray100,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
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
                            textStyle: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                          ),
                          const Text(
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
                            _showChangeTableDialog(
                                order, data.tables, data);
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
                            _cancelOrderFlow(order, data);
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
                    const Text(
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
                        child: const Icon(
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
                          if (auth.currentStore?.remoteBillingEnabled ==
                              true) {
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
                          _showCombineTableDialog(
                              order, data.tables, data);
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
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray200),
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
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.gray500,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 18, color: AppColors.gray500),
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
      color: bg,
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
                style: const TextStyle(
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
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.gray200),
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
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.dark,
                  ),
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 14, color: AppColors.gray500),
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
          decoration: const BoxDecoration(
            color: Colors.white,
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
              const Text(
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
                            style: const TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.dark,
                            ),
                          ),
                        ),
                        Text(
                          '× ${oi.quantity}',
                          style: const TextStyle(
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
                            style: const TextStyle(
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
                  const Text(
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
          style: const TextStyle(fontSize: 13, color: AppColors.gray600),
        ),
        Text(
          '₹${amount.toStringAsFixed(2)}',
          style: const TextStyle(
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

  void _cancelOrderFlow(Order order, DataProvider data) async {
    final navigator = Navigator.of(context);
    final scaffoldMessenger = ScaffoldMessenger.of(context);

    final confirm = await showDialog<bool>(
      context: navigator.context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel Order?'),
        content:
            const Text('Are you sure you want to cancel this order?'),
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

    if (confirm == true) {
      showDialog(
        context: navigator.context,
        barrierDismissible: false,
        builder: (loadingContext) => Center(
          child: CircularProgressIndicator(
            color: AppColors.primary,
          ),
        ),
      );

      try {
        final success = await data.cancelOrder(order.id);
        navigator.pop();

        if (success) {
          scaffoldMessenger.showSnackBar(
            const SnackBar(
              content: Text('Order cancelled and table released'),
              backgroundColor: AppColors.danger,
            ),
          );
        } else {
          scaffoldMessenger.showSnackBar(
            SnackBar(
              content:
                  Text(data.error ?? 'Failed to cancel order.'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
      } catch (e) {
        navigator.pop();
        scaffoldMessenger.showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  _TableStatusFilter _statusFor(TableModel table, DataProvider data) {
    if (data.isTableOccupied(table.id)) return _TableStatusFilter.occupied;
    return table.isActive
        ? _TableStatusFilter.available
        : _TableStatusFilter.reserved;
  }

  List<TableModel> _filteredTables(
      List<TableModel> tables, DataProvider data) {
    if (_statusFilter == _TableStatusFilter.all) return tables;
    return tables
        .where((table) => _statusFor(table, data) == _statusFilter)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final tables = data.tables;

    final occupiedCount = tables
        .where((t) => _statusFor(t, data) == _TableStatusFilter.occupied)
        .length;
    final reservedCount = tables
        .where((t) => _statusFor(t, data) == _TableStatusFilter.reserved)
        .length;
    final availableCount =
        tables.length - occupiedCount - reservedCount;
    final filteredTables = _filteredTables(tables, data);
    final crossAxisCount = ResponsiveHelper.getGridCrossAxisCount(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Tables',
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: _buildFilterPills(
              total: tables.length,
              occupied: occupiedCount,
              available: availableCount,
              reserved: reservedCount,
            ),
          ),
          const SizedBox(height: 14),
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
                              return Wrap(
                                spacing: spacing,
                                runSpacing: spacing,
                                children: [
                                  for (final table in filteredTables)
                                    SizedBox(
                                      width: cardWidth,
                                      child: _buildTableCard(table, data),
                                    ),
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

  Widget _buildFilterPills({
    required int total,
    required int occupied,
    required int available,
    required int reserved,
  }) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _statFilterPill(
            icon: Icons.grid_view_rounded,
            label: 'All',
            count: total,
            value: _TableStatusFilter.all,
          ),
          const SizedBox(width: 8),
          _statFilterPill(
            icon: Icons.people_alt_outlined,
            label: 'Occupied',
            count: occupied,
            value: _TableStatusFilter.occupied,
          ),
          const SizedBox(width: 8),
          _statFilterPill(
            icon: Icons.table_restaurant,
            label: 'Available',
            count: available,
            value: _TableStatusFilter.available,
          ),
          const SizedBox(width: 8),
          _statFilterPill(
            icon: Icons.schedule,
            label: 'Reserved',
            count: reserved,
            value: _TableStatusFilter.reserved,
          ),
        ],
      ),
    );
  }

  Widget _statFilterPill({
    required IconData icon,
    required String label,
    required int count,
    required _TableStatusFilter value,
  }) {
    final selected = _statusFilter == value;
    return GestureDetector(
      onTap: () => setState(() => _statusFilter = value),
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
              '$label ($count)',
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

  Widget _buildTableCard(TableModel table, DataProvider data) {
    final order = data.getOrderForTable(table.id);
    final status = _statusFor(table, data);
    final isOccupied = status == _TableStatusFilter.occupied;
    final isReserved = status == _TableStatusFilter.reserved;

    final Color cardBg;
    final Color badgeColor;
    final IconData badgeIcon;
    if (isOccupied) {
      cardBg = const Color(0xFFFFEEE0);
      badgeColor = AppColors.primary;
      badgeIcon = Icons.people;
    } else if (isReserved) {
      cardBg = const Color(0xFFEAF2FE);
      badgeColor = AppColors.info;
      badgeIcon = Icons.schedule;
    } else {
      cardBg = const Color(0xFFE7F7EC);
      badgeColor = AppColors.success;
      badgeIcon = Icons.check;
    }

    return Material(
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
        borderRadius: BorderRadius.circular(18),
        child: Container(
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: badgeColor.withOpacity(0.10),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 2),
              Align(
                alignment: Alignment.topRight,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _showTableOptions(table, order, data),
                  child: const Padding(
                    padding: EdgeInsets.fromLTRB(14, 4, 10, 2),
                    child: Icon(
                      Icons.more_vert,
                      size: 17,
                      color: AppColors.gray600,
                    ),
                  ),
                ),
              ),
              Stack(
                clipBehavior: Clip.none,
                children: [
                  SizedBox(
                    width: 58,
                    height: 58,
                    child: CustomPaint(
                      painter: _DiningSetPainter(
                        tableColor: badgeColor.withOpacity(0.35),
                        chairColor: badgeColor,
                      ),
                    ),
                  ),
                  Positioned(
                    top: -4,
                    right: -4,
                    child: Container(
                      width: 21,
                      height: 21,
                      decoration: BoxDecoration(
                        color: badgeColor,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Icon(
                        badgeIcon,
                        size: 11,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                table.label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                  height: 1.15,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                '${table.seats} ${table.seats == 1 ? 'seat' : 'seats'}',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: AppColors.gray600,
                ),
              ),
              const SizedBox(height: 9),
              if (!isOccupied)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: isReserved
                          ? AppColors.info
                          : AppColors.success,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isReserved) ...[
                          const Icon(Icons.schedule,
                              size: 11, color: Colors.white),
                          const SizedBox(width: 4),
                        ],
                        Text(
                          isReserved ? 'Reserved' : 'Available',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (isOccupied) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          '₹${order!.totalAmount.toStringAsFixed(0)}',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 10),
                      OrderTimer(
                        order: order,
                        showIcon: false,
                        textStyle: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.dark,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  decoration: const BoxDecoration(
                    border: Border(
                      top: BorderSide(color: Color(0x33D97B23)),
                    ),
                  ),
                  child: IntrinsicHeight(
                    child: Row(
                      children: [
                        _cardAction(
                          icon: Icons.description_outlined,
                          color: AppColors.dark,
                          onTap: () => _showOrderSummarySheet(order),
                        ),
                        _cardAction(
                          icon: Icons.edit_outlined,
                          color: AppColors.dark,
                          onTap: () {
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
                          },
                        ),
                        _cardAction(
                          icon: Icons.close,
                          color: AppColors.danger,
                          onTap: () => _cancelOrderFlow(order, data),
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
          height: 42,
          decoration: BoxDecoration(
            border: isLast
                ? null
                : const Border(
                    right: BorderSide(color: Color(0x33D97B23)),
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
                      Colors.white,
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
              const Text(
                'No tables available yet',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
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
        child: const Center(
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

enum _TableStatusFilter { all, occupied, available, reserved }

/// Top-down dining set illustration: a center table with 4 chairs.
class _DiningSetPainter extends CustomPainter {
  final Color tableColor;
  final Color chairColor;

  _DiningSetPainter({required this.tableColor, required this.chairColor});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final chairPaint = Paint()..color = chairColor;
    final tablePaint = Paint()..color = tableColor;

    const chairR = Radius.circular(3.5);
    // Left & right chairs
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(0, h * 0.28, w * 0.17, h * 0.44), chairR),
      chairPaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.83, h * 0.28, w * 0.17, h * 0.44), chairR),
      chairPaint,
    );
    // Top & bottom chairs
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.28, 0, w * 0.44, h * 0.17), chairR),
      chairPaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(w * 0.28, h * 0.83, w * 0.44, h * 0.17), chairR),
      chairPaint,
    );
    // Table body + inner plate
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.24, h * 0.24, w * 0.52, h * 0.52),
        const Radius.circular(8),
      ),
      tablePaint,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.31, h * 0.31, w * 0.38, h * 0.38),
        const Radius.circular(5),
      ),
      Paint()..color = chairColor.withOpacity(0.45),
    );
  }

  @override
  bool shouldRepaint(_DiningSetPainter old) =>
      old.tableColor != tableColor || old.chairColor != chairColor;
}
