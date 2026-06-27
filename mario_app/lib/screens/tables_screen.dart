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
      await context.read<DataProvider>().silentUpdateTablesAndOrders(auth.currentStore!.id);
    }
  }

  Future<void> _refreshData() async {
    final auth = context.read<AuthProvider>();
    if (auth.currentStore != null) {
      await context.read<DataProvider>().loadTables(auth.currentStore!.id);
      await context.read<DataProvider>().loadOrders(auth.currentStore!.id);
    }
  }

  void _showChangeTableDialog(Order order, List<TableModel> tables, DataProvider data) {
    final parentContext = context;
    final availableTables = tables.where((t) => 
      t.id != order.tableId && !data.isTableOccupied(t.id)
    ).toList();

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
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          title: const Text('Move Order to Table'),
          content: SizedBox(
            width: double.maxFinite,
            child: GridView.builder(
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
                      builder: (loadingContext) => const Center(
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
                            content: Text('Order moved to Table ${table.number}'),
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
                            content: Text(data.error ?? 'Failed to move order.'),
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
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.gray200,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          '${table.number}',
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

  void _showTableOptions(TableModel table, Order? order, DataProvider data) {
    final parentContext = context;
    final auth = parentContext.read<AuthProvider>();
    
    showModalBottomSheet(
      context: parentContext,
      backgroundColor: AppColors.light,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Table ${table.number}',
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.dark,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: order != null
                    ? AppColors.primary.withOpacity(0.1)
                    : AppColors.success.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                order != null ? 'Occupied' : 'Available',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: order != null ? AppColors.primary : AppColors.success,
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (order == null)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.add_circle, color: AppColors.primary, size: 22),
                ),
                title: const Text('Create Order', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                onTap: () {
                  Navigator.pop(sheetContext);
                  Navigator.push(
                    parentContext,
                    MaterialPageRoute(
                      builder: (_) => OrderScreen(
                        table: table,
                        isNewOrder: true,
                      ),
                    ),
                  );
                },
              ),
            if (order != null) ...[
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.info.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.edit, color: AppColors.info, size: 22),
                ),
                title: const Text('Edit Order', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
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
              if (auth.currentStore?.remoteBillingEnabled == true)
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.success.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.receipt, color: AppColors.success, size: 22),
                  ),
                  title: const Text('Generate Bill', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    Navigator.push(
                      parentContext,
                      MaterialPageRoute(
                        builder: (_) => BillScreen(order: order),
                      ),
                    );
                  },
                ),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.warning.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.swap_horiz, color: AppColors.warning, size: 22),
                ),
                title: const Text('Move to Another Table', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showChangeTableDialog(order, data.tables, data);
                },
              ),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                leading: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.danger.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.cancel, color: AppColors.danger, size: 22),
                ),
                title: const Text('Cancel Order', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: AppColors.danger)),
                onTap: () async {
                  final navigator = Navigator.of(parentContext);
                  final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

                  Navigator.pop(sheetContext); // Dismiss bottom options sheet
                  
                  final confirm = await showDialog<bool>(
                    context: navigator.context,
                    builder: (dialogContext) => AlertDialog(
                      title: const Text('Cancel Order?'),
                      content: const Text('Are you sure you want to cancel this order?'),
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
                    // Show progress indicator overlay using captured navigator context
                    showDialog(
                      context: navigator.context,
                      barrierDismissible: false,
                      builder: (loadingContext) => const Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primary,
                        ),
                      ),
                    );

                    try {
                      final success = await data.cancelOrder(order.id);
                      
                      // Dismiss progress indicator using captured navigator
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
                            content: Text(data.error ?? 'Failed to cancel order.'),
                            backgroundColor: AppColors.danger,
                          ),
                        );
                      }
                    } catch (e) {
                      // Dismiss progress indicator using captured navigator
                      navigator.pop();
                      scaffoldMessenger.showSnackBar(
                        SnackBar(
                          content: Text('Error: ${e.toString()}'),
                          backgroundColor: AppColors.danger,
                        ),
                      );
                    }
                  }
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final tables = data.tables;
    
    final isTablet = ResponsiveHelper.isTablet(context);
    final crossAxisCount = ResponsiveHelper.getGridCrossAxisCount(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Tables',
      ),
      body: RefreshIndicator(
        onRefresh: _refreshData,
        color: AppColors.primary,
        child: tables.isEmpty
            ? SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: SizedBox(
                  height: MediaQuery.of(context).size.height * 0.7,
                  child: Center(
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
                            Icons.table_restaurant_outlined,
                            size: 40,
                            color: AppColors.gray400,
                          ),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'No tables available',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppColors.gray600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            : GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: crossAxisCount,
                  childAspectRatio: isTablet ? 1.1 : 0.82,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 14,
                ),
                itemCount: tables.length,
                itemBuilder: (context, index) {
                  final table = tables[index];
                  final order = data.getOrderForTable(table.id);
                  final isOccupied = order != null;

                  return Container(
                    decoration: BoxDecoration(
                      color: AppColors.light,
                      borderRadius: BorderRadius.circular(20),
                      border: isOccupied
                          ? Border.all(color: AppColors.primary.withOpacity(0.3), width: 1.5)
                          : null,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.dark.withOpacity(0.04),
                          blurRadius: 16,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () => _showTableOptions(table, order, data),
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(20),
                            gradient: isOccupied
                                ? LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      AppColors.primary.withOpacity(0.08),
                                      AppColors.primary.withOpacity(0.02),
                                    ],
                                  )
                                : null,
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: isOccupied
                                      ? AppColors.primary.withOpacity(0.15)
                                      : AppColors.gray200,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  Icons.table_restaurant,
                                  size: 24,
                                  color: isOccupied
                                      ? AppColors.primary
                                      : AppColors.gray500,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                'Table ${table.number}',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.dark,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${table.seats} seats',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isOccupied
                                      ? AppColors.primary
                                      : AppColors.gray500,
                                ),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: isOccupied
                                      ? AppColors.primary
                                      : AppColors.success.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  isOccupied ? 'Occupied' : 'Available',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: isOccupied
                                        ? AppColors.light
                                        : AppColors.success,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              if (isOccupied) ...[
                                const SizedBox(height: 6),
                                Text(
                                  '₹${order.totalAmount.toStringAsFixed(0)}',
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                  textAlign: TextAlign.center,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
