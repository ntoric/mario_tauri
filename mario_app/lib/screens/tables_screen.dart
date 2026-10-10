import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../models/table.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../providers/theme_provider.dart';
import '../widgets/app_header.dart';
import '../widgets/order_timer.dart';
import '../widgets/order_ui.dart';
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
  String _filter = 'all';

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

    showModalBottomSheet(
      context: parentContext,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final navigator = Navigator.of(parentContext);
        final scaffoldMessenger = ScaffoldMessenger.of(parentContext);
        final isWide = MediaQuery.of(parentContext).size.width >= 600;

        return SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.gray300,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.tableReserved.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.swap_horiz_rounded,
                          size: 22, color: AppColors.tableReserved),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Move order',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.dark,
                            ),
                          ),
                          Text(
                            'From Table ${order.tableNumber} • pick a free table',
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.gray600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    InkWell(
                      onTap: () => Navigator.pop(sheetContext),
                      borderRadius: BorderRadius.circular(999),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: AppColors.gray100,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.close_rounded,
                            size: 18, color: AppColors.gray700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(sheetContext).size.height * 0.5,
                  ),
                  child: GridView.builder(
                    shrinkWrap: true,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: isWide ? 6 : 4,
                      childAspectRatio: 1,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                    ),
                    itemCount: availableTables.length,
                    itemBuilder: (itemBuilderContext, index) {
                      final table = availableTables[index];
                      return InkWell(
                        onTap: () async {
                          Navigator.pop(sheetContext);

                          showDialog(
                            context: navigator.context,
                            barrierDismissible: false,
                            builder: (loadingContext) => Center(
                              child: CircularProgressIndicator(
                                color: loadingContext
                                    .read<ThemeProvider>()
                                    .currentTheme
                                    .primary,
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
                                      'Order moved to Table ${table.number}'),
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
                                      data.error ?? 'Failed to move order.'),
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
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                                color: Colors.black.withOpacity(0.07)),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                '${table.number}',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.dark,
                                ),
                              ),
                              Text(
                                '${table.seats} seats',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.gray600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
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

    showModalBottomSheet(
      context: parentContext,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => TableActionsSheet(
        table: table,
        order: order,
        remoteBilling: auth.currentStore?.remoteBillingEnabled == true,
        onCreateOrder: () {
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
        onEditOrder: () {
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
        onGenerateBill: () {
          Navigator.pop(sheetContext);
          Navigator.push(
            parentContext,
            MaterialPageRoute(
              builder: (_) => BillScreen(order: order!),
            ),
          );
        },
        onCheckout: () async {
          final navigator = Navigator.of(parentContext);
          final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

          Navigator.pop(sheetContext); // Dismiss bottom options sheet

          final confirm = await showDialog<bool>(
            context: navigator.context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Checkout Order?'),
              content: const Text(
                  'Complete this order and release the table? The bill will not be printed.'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('No'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Yes, Checkout'),
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
                  color: loadingContext
                      .read<ThemeProvider>()
                      .currentTheme
                      .primary,
                ),
              ),
            );

            try {
              final success = await data.completeOrder(order!.id);

              navigator.pop();

              if (success) {
                scaffoldMessenger.showSnackBar(
                  const SnackBar(
                    content: Text('Order completed and table released'),
                    backgroundColor: AppColors.success,
                  ),
                );
              } else {
                scaffoldMessenger.showSnackBar(
                  SnackBar(
                    content:
                        Text(data.error ?? 'Failed to complete order.'),
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
        },
        onMoveTable: () {
          Navigator.pop(sheetContext);
          _showChangeTableDialog(order!, data.tables, data);
        },
        onCancelOrder: () async {
          final navigator = Navigator.of(parentContext);
          final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

          Navigator.pop(sheetContext); // Dismiss bottom options sheet

          final confirm = await showDialog<bool>(
            context: navigator.context,
            builder: (dialogContext) => AlertDialog(
              title: const Text('Cancel Order?'),
              content: const Text(
                  'Are you sure you want to cancel this order?'),
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
              builder: (loadingContext) => Center(
                child: CircularProgressIndicator(
                  color: loadingContext
                      .read<ThemeProvider>()
                      .currentTheme
                      .primary,
                ),
              ),
            );

            try {
              final success = await data.cancelOrder(order!.id);

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
    );
  }

  List<TableModel> _filteredTables(List<TableModel> tables, DataProvider data) {
    switch (_filter) {
      case 'available':
        return tables
            .where((t) => data.getOrderForTable(t.id) == null)
            .toList();
      case 'occupied':
        return tables
            .where((t) => data.getOrderForTable(t.id) != null)
            .toList();
      case 'reserved':
        return const [];
      default:
        return tables;
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final palette = context.watch<ThemeProvider>().currentTheme;
    final tables = data.tables;
    final filteredTables = _filteredTables(tables, data);

    final occupiedCount =
        tables.where((t) => data.getOrderForTable(t.id) != null).length;
    final availableCount = tables.length - occupiedCount;

    final isMobile = ResponsiveHelper.isMobile(context);
    final crossAxisCount =
        isMobile ? 3 : ResponsiveHelper.getGridCrossAxisCount(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: ScreenHeader(
              title: 'Tables',
              subtitle: auth.currentStore?.displayName,
              showSubtitleChevron: true,
              onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
            ),
          ),
          _FilterChipRow(
            selected: _filter,
            onSelected: (filter) => setState(() => _filter = filter),
            allCount: tables.length,
            availableCount: availableCount,
            occupiedCount: occupiedCount,
            reservedCount: 0,
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _refreshData,
              color: palette.primary,
              child: tables.isEmpty
                  ? SingleChildScrollView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      child: SizedBox(
                        height: MediaQuery.of(context).size.height * 0.6,
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
                                      palette.primarySoft,
                                    ],
                                  ),
                                ),
                                child: Icon(
                                  Icons.table_restaurant_outlined,
                                  size: 40,
                                  color: palette.primary,
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
                    )
                  : filteredTables.isEmpty
                      ? SingleChildScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          child: SizedBox(
                            height: MediaQuery.of(context).size.height * 0.5,
                            child: Center(
                              child: Text(
                                'No tables',
                                style: TextStyle(
                                  color: AppColors.gray500,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        )
                      : GridView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: crossAxisCount,
                            childAspectRatio: isMobile ? 0.72 : 1.0,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                          ),
                          itemCount: filteredTables.length,
                          itemBuilder: (context, index) {
                            final table = filteredTables[index];
                            final order = data.getOrderForTable(table.id);
                            return TableCard(
                              table: table,
                              order: order,
                              onTap: () =>
                                  _showTableOptions(table, order, data),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChipRow extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onSelected;
  final int allCount;
  final int availableCount;
  final int occupiedCount;
  final int reservedCount;

  const _FilterChipRow({
    required this.selected,
    required this.onSelected,
    required this.allCount,
    required this.availableCount,
    required this.occupiedCount,
    required this.reservedCount,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        children: [
          _FilterChip(
            label: 'All',
            count: allCount,
            selected: selected == 'all',
            onTap: () => onSelected('all'),
          ),
          _FilterChip(
            label: 'Available',
            dotColor: AppColors.tableAvailable,
            count: availableCount,
            selected: selected == 'available',
            onTap: () => onSelected('available'),
          ),
          _FilterChip(
            label: 'Occupied',
            dotColor: AppColors.tableOccupied,
            count: occupiedCount,
            selected: selected == 'occupied',
            onTap: () => onSelected('occupied'),
          ),
          _FilterChip(
            label: 'Reserved',
            dotColor: AppColors.tableReserved,
            count: reservedCount,
            selected: selected == 'reserved',
            onTap: () => onSelected('reserved'),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final Color? dotColor;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    this.dotColor,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: selected ? palette.primarySoft : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color:
                    selected ? palette.primary : Colors.black.withOpacity(0.05),
                width: selected ? 1.5 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dotColor != null) ...[
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: selected ? palette.primaryDark : AppColors.gray700,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: selected ? palette.primary : AppColors.gray200,
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
        ),
      ),
    );
  }
}

class TableCard extends StatelessWidget {
  final TableModel table;
  final Order? order;
  final VoidCallback onTap;

  const TableCard({
    super.key,
    required this.table,
    this.order,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isOccupied = order != null;
    final statusColor =
        isOccupied ? AppColors.tableOccupied : AppColors.tableAvailable;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isOccupied
              ? AppColors.tableOccupied.withOpacity(0.5)
              : Colors.black.withOpacity(0.04),
          width: isOccupied ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            children: [
              Positioned.fill(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final compact = constraints.maxHeight < 150;
                      return FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.table_restaurant,
                              size: compact ? 32 : 40,
                              color: AppColors.wood,
                            ),
                            SizedBox(height: compact ? 4 : 6),
                            Text(
                              'Table ${table.number}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.dark,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 1),
                            Text(
                              '${table.seats} seats',
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                                color: AppColors.gray600,
                              ),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (order != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                '₹${order!.totalAmount.toStringAsFixed(0)}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.dark,
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 1),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: OrderTimer(
                                  order: order!,
                                  showIcon: false,
                                  textStyle: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.gray600,
                                  ),
                                ),
                              ),
                            ],
                            SizedBox(height: compact ? 5 : 7),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: statusColor.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 7,
                                    height: 7,
                                    decoration: BoxDecoration(
                                      color: statusColor,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    isOccupied ? 'Occupied' : 'Available',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: statusColor,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
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

class TableActionsSheet extends StatelessWidget {
  final TableModel table;
  final Order? order;
  final bool remoteBilling;
  final VoidCallback onCreateOrder;
  final VoidCallback onEditOrder;
  final VoidCallback onCheckout;
  final VoidCallback onGenerateBill;
  final VoidCallback onMoveTable;
  final VoidCallback onCancelOrder;

  const TableActionsSheet({
    super.key,
    required this.table,
    required this.order,
    required this.remoteBilling,
    required this.onCreateOrder,
    required this.onEditOrder,
    required this.onCheckout,
    required this.onGenerateBill,
    required this.onMoveTable,
    required this.onCancelOrder,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final occupied = order != null;
    final statusColor =
        occupied ? AppColors.tableOccupied : AppColors.tableAvailable;

    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.gray300,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(Icons.table_restaurant_rounded,
                      size: 26, color: statusColor),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Table ${table.number}',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Row(
                          children: [
                            const Icon(Icons.event_seat_outlined,
                                size: 14, color: AppColors.gray600),
                            const SizedBox(width: 4),
                            Text(
                              '${table.seats} seats',
                              style: const TextStyle(
                                  fontSize: 13, color: AppColors.gray600),
                            ),
                            const SizedBox(width: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: statusColor.withOpacity(0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 6,
                                    height: 6,
                                    decoration: BoxDecoration(
                                      color: statusColor,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    occupied ? 'Occupied' : 'Available',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: statusColor,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  borderRadius: BorderRadius.circular(999),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: const BoxDecoration(
                      color: AppColors.gray100,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close_rounded,
                        size: 18, color: AppColors.gray700),
                  ),
                ),
              ],
            ),
            if (occupied) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: palette.background,
                  borderRadius: BorderRadius.circular(18),
                  border:
                      Border.all(color: Colors.black.withOpacity(0.05)),
                ),
                child: Column(
                  children: [
                    IntrinsicHeight(
                      child: Row(
                        children: [
                          _SheetStat(
                            label: 'Items',
                            value: Text(
                              '${order!.items.fold<int>(0, (s, i) => s + i.quantity)}',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                          ),
                          Container(
                              width: 1, height: 32, color: AppColors.gray300),
                          _SheetStat(
                            label: 'Running',
                            value: OrderTimer(
                              order: order!,
                              showIcon: false,
                              textStyle: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                          ),
                          Container(
                              width: 1, height: 32, color: AppColors.gray300),
                          _SheetStat(
                            label: 'Amount',
                            value: Text(
                              '₹${order!.totalAmount.toStringAsFixed(0)}',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: palette.highlight,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        const Icon(Icons.schedule,
                            size: 13, color: AppColors.gray600),
                        const SizedBox(width: 4),
                        Text(
                          'Ordered ${DateFormat('hh:mm a').format(order!.createdAt)}',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.gray600),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (order!.items.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (final item in order!.items.take(3))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 28,
                          child: Text(
                            '${item.quantity}×',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.gray700,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            item.item.name,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.gray800,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          '₹${((item.unitPrice ?? item.item.price) * item.quantity).toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.dark,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (order!.items.length > 3)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '+${order!.items.length - 3} more',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: palette.highlight,
                      ),
                    ),
                  ),
              ],
            ],
            const SizedBox(height: 18),
            if (occupied)
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: onEditOrder,
                        icon: const Icon(Icons.edit_rounded, size: 22),
                        label: const Text('Edit Order'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: palette.primary,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          textStyle: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 54,
                      child: ElevatedButton.icon(
                        onPressed: onCheckout,
                        icon: const Icon(Icons.check_circle_outline_rounded,
                            size: 22),
                        label: const Text('Checkout'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.tableAvailable,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          textStyle: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              )
            else
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: onCreateOrder,
                  icon: const Icon(Icons.add_rounded, size: 22),
                  label: const Text('Create Order'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: palette.primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    textStyle: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
            if (occupied) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (remoteBilling) ...[
                    Expanded(
                      child: _SheetActionTile(
                        icon: Icons.receipt_long_rounded,
                        label: 'Checkout & Print',
                        color: AppColors.tableAvailable,
                        onTap: onGenerateBill,
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: _SheetActionTile(
                      icon: Icons.swap_horiz_rounded,
                      label: 'Move Table',
                      color: AppColors.tableReserved,
                      onTap: onMoveTable,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _SheetActionTile(
                      icon: Icons.cancel_outlined,
                      label: 'Cancel Order',
                      color: AppColors.danger,
                      labelColor: AppColors.danger,
                      onTap: onCancelOrder,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SheetStat extends StatelessWidget {
  final String label;
  final Widget value;

  const _SheetStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.gray600),
          ),
          const SizedBox(height: 2),
          FittedBox(fit: BoxFit.scaleDown, child: value),
        ],
      ),
    );
  }
}

class _SheetActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color? labelColor;
  final VoidCallback onTap;

  const _SheetActionTile({
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
