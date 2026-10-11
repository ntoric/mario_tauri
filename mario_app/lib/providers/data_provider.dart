import 'package:flutter/material.dart';
import '../backend/backend_service.dart';
import '../models/table.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../models/bill.dart';
import '../models/statistics.dart';
import '../models/app_update.dart';
import 'auth_provider.dart';

class DataProvider extends ChangeNotifier {
  final BackendService _backend = BackendService();

  List<TableModel> _tables = [];
  List<Category> _categories = [];
  List<Item> _items = [];

  // _orders holds only currently-active orders — the operational view.
  // Historical orders live in _historyOrders and are fetched on demand with
  // a date bound so the whole order history is never pulled at once.
  List<Order> _orders = [];
  List<Order> _historyOrders = [];
  DateTime? _historyFrom;
  DateTime? _historyTo;
  bool _historyLoaded = false;
  List<Bill> _bills = [];
  SystemStats? _stats;
  AppUpdate? _appUpdate;

  bool _isLoading = false;
  String? _error;

  List<TableModel> get tables => _tables;
  List<Category> get categories => _categories;
  List<Item> get items => _items;
  List<Order> get orders => _orders;
  List<Order> get historyOrders => _historyOrders;
  List<Order> get activeOrders => _orders.where((o) => o.isActive).toList();
  List<Bill> get bills => _bills;
  SystemStats? get stats => _stats;
  AppUpdate? get appUpdate => _appUpdate;
  bool get isLoading => _isLoading;
  String? get error => _error;

  // Clears all store-scoped data. Call before switching stores or on logout so
  // the previous store's records are never shown under the new selection.
  void clearData() {
    _tables = [];
    _categories = [];
    _items = [];
    _orders = [];
    _historyOrders = [];
    _historyFrom = null;
    _historyTo = null;
    _historyLoaded = false;
    _bills = [];
    _stats = null;
    notifyListeners();
  }

  Future<void> loadAllData(AuthProvider auth) async {
    if (auth.currentStore == null) return;

    final storeId = auth.currentStore!.id;

    await Future.wait([
      loadTables(storeId),
      loadCategories(storeId),
      loadItems(storeId),
      loadOrders(storeId),
    ]);
  }

  Future<void> loadTables(String storeId) async {
    try {
      final data = await _backend.api.getTables(storeId);
      _tables = data;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadCategories(String storeId) async {
    try {
      final data = await _backend.api.getCategories(storeId);
      _categories = data;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadItems(String storeId) async {
    try {
      final data = await _backend.api.getItems(storeId);
      _items = data;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadOrders(String storeId, {String status = 'active'}) async {
    try {
      final data = await _backend.api.getOrders(storeId, status: status);
      _orders = data;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  /// Fetches historical orders (all statuses) for the given window. Used by
  /// the history/statistics screens; kept separate from [_orders] so it never
  /// disturbs the active-orders view.
  Future<void> loadHistoryOrders(
    String storeId, {
    DateTime? from,
    DateTime? to,
  }) async {
    try {
      final data = await _backend.api.getOrders(storeId, from: from, to: to);
      _historyOrders = data;
      _historyFrom = from;
      _historyTo = to;
      _historyLoaded = true;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  // Refreshes the history window only if a screen has loaded it before, so
  // status changes surface in Order History without eager polling.
  Future<void> _refreshHistoryIfLoaded(String storeId) async {
    if (_historyLoaded) {
      await loadHistoryOrders(storeId, from: _historyFrom, to: _historyTo);
    }
  }

  Future<void> loadBills(
    String storeId, {
    DateTime? from,
    DateTime? to,
    int? limit,
  }) async {
    try {
      final data =
          await _backend.api.getBills(storeId, from: from, to: to, limit: limit);
      _bills = data;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadStats() async {
    try {
      _stats = await _backend.api.getSystemStats();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Order? getOrderForTable(String tableId) {
    try {
      return _orders.firstWhere(
        (o) => o.tableId == tableId && o.isActive,
      );
    } catch (e) {
      return null;
    }
  }

  bool isTableOccupied(String tableId) {
    return getOrderForTable(tableId) != null;
  }

  Future<Order?> createOrder({
    required String tableId,
    required int tableNumber,
    String? tableName,
    required List<Map<String, dynamic>> items,
    required double totalAmount,
    required double taxAmount,
    required String storeId,
  }) async {
    try {
      final orderData = {
        'tableId': tableId,
        'tableNumber': tableNumber,
        if (tableName != null && tableName.isNotEmpty)
          'tableName': tableName,
        'items': items,
        'totalAmount': totalAmount,
        'taxAmount': taxAmount,
        'discountAmount': 0,
        'storeId': storeId,
      };
      final order = await _backend.api.createOrder(orderData);
      _orders.insert(0, order);
      notifyListeners();
      return order;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<Order?> createParcelOrder({
    required List<Map<String, dynamic>> items,
    required double totalAmount,
    required double taxAmount,
    required String storeId,
    required String paymentMethod,
    String? customerName,
    String? customerMobile,
  }) async {
    try {
      final orderData = {
        'storeId': storeId,
        'items': items,
        'totalAmount': totalAmount,
        'taxAmount': taxAmount,
        'discountAmount': 0,
        'paymentMethod': paymentMethod,
        'customerName': customerName ?? 'Walk-in Customer',
        'customerMobile': customerMobile,
      };
      final order = await _backend.api.createParcelOrder(orderData);
      _orders.insert(0, order);
      notifyListeners();
      _refreshHistoryIfLoaded(storeId);
      return order;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<Order?> updateOrder({
    required String orderId,
    required List<Map<String, dynamic>> items,
    required double totalAmount,
    required double taxAmount,
    String? tableId,
    int? tableNumber,
  }) async {
    try {
      final orderData = {
        'items': items,
        'totalAmount': totalAmount,
        'taxAmount': taxAmount,
        if (tableId != null) 'tableId': tableId,
        if (tableNumber != null) 'tableNumber': tableNumber,
      };

      final order = await _backend.api.updateOrder(orderId, orderData);

      final index = _orders.indexWhere((o) => o.id == orderId);
      if (index >= 0) {
        _orders[index] = order;
      }
      notifyListeners();
      return order;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> completeOrder(String orderId, {String? paymentMethod}) async {
    try {
      await _backend.api.completeOrder(orderId, paymentMethod: paymentMethod);

      final index = _orders.indexWhere((o) => o.id == orderId);
      String? storeId;
      if (index >= 0) {
        storeId = _orders[index].storeId;
        _orders[index] = Order(
          id: _orders[index].id,
          storeId: _orders[index].storeId,
          tableId: _orders[index].tableId,
          tableNumber: _orders[index].tableNumber,
          tableName: _orders[index].tableName,
          items: _orders[index].items,
          status: 'completed',
          totalAmount: _orders[index].totalAmount,
          taxAmount: _orders[index].taxAmount,
          discountAmount: _orders[index].discountAmount,
          paymentMethod: paymentMethod,
          paymentStatus: 'paid',
          createdAt: _orders[index].createdAt,
          updatedAt: DateTime.now(),
          createdBy: _orders[index].createdBy,
        );
      }
      notifyListeners();
      if (storeId != null) {
        _refreshHistoryIfLoaded(storeId);
      }
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> cancelOrder(String orderId, {String? reason}) async {
    try {
      final order = _orders.firstWhere(
        (o) => o.id == orderId,
        orElse: () => _historyOrders.firstWhere((o) => o.id == orderId),
      );

      await _backend.api.cancelOrder(orderId, reason: reason);

      // Reload orders from backend to ensure perfect sync
      await loadOrders(order.storeId);
      _refreshHistoryIfLoaded(order.storeId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> moveOrderToTable(
      String orderId, String newTableId, int newTableNumber) async {
    try {
      final order = _orders.firstWhere((o) => o.id == orderId);

      await _backend.api.updateOrder(orderId, {
        'tableId': newTableId,
        'tableNumber': newTableNumber,
        'items': order.items
            .map((i) => {
                  'itemId': i.itemId,
                  'quantity': i.quantity,
                  'item': i.item.toJson(),
                })
            .toList(),
        'totalAmount': order.totalAmount,
        'taxAmount': order.taxAmount,
      });

      // Reload orders from the backend to ensure perfect state synchronization
      await loadOrders(order.storeId);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Combines the order of another occupied table ([mergeOrderId]) into
  /// [orderId]. The absorbed order is marked 'merged' server-side and its
  /// table is freed; the returned order carries the combined items/totals.
  Future<Order?> mergeOrders(String orderId, String mergeOrderId) async {
    try {
      final order = _orders.firstWhere((o) => o.id == orderId);

      final merged = await _backend.api.mergeOrders(orderId, mergeOrderId);

      // Reload orders from the backend to pick up the absorbed order's
      // 'merged' status and the expanded primary order.
      await loadOrders(order.storeId);
      return merged;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<String> getNextInvoiceNo(String storeId) async {
    return await _backend.api.getNextInvoiceNo(storeId);
  }

  Future<Bill?> createBill(Map<String, dynamic> billData) async {
    try {
      final bill = await _backend.api.createBill(billData);
      _bills.insert(0, bill);
      notifyListeners();
      return bill;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> enqueueBill(Map<String, dynamic> billData) async {
    try {
      await _backend.api.enqueueBill(billData);
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> fetchBillQueue(String storeId) async {
    try {
      return await _backend.api.getBillQueue(storeId);
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return [];
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  Future<bool> silentUpdateTablesAndOrders(String storeId) async {
    try {
      final newTables = await _backend.api.getTables(storeId);
      final newOrders =
          await _backend.api.getOrders(storeId, status: 'active');

      bool tablesChanged = false;
      if (newTables.length != _tables.length) {
        tablesChanged = true;
      } else {
        for (int i = 0; i < newTables.length; i++) {
          if (!_areTablesEqual(newTables[i], _tables[i])) {
            tablesChanged = true;
            break;
          }
        }
      }

      bool ordersChanged = false;
      if (newOrders.length != _orders.length) {
        ordersChanged = true;
      } else {
        for (int i = 0; i < newOrders.length; i++) {
          if (!_areOrdersEqual(newOrders[i], _orders[i])) {
            ordersChanged = true;
            break;
          }
        }
      }

      if (tablesChanged || ordersChanged) {
        _tables = newTables;
        _orders = newOrders;
        notifyListeners();
        return true;
      }
    } catch (e, stack) {
      debugPrint('Silent update failed: $e');
      debugPrintStack(stackTrace: stack);
    }
    return false;
  }

  bool _areTablesEqual(TableModel a, TableModel b) {
    return a.id == b.id &&
        a.storeId == b.storeId &&
        a.number == b.number &&
        a.name == b.name &&
        a.seats == b.seats &&
        a.isActive == b.isActive;
  }

  bool _areOrdersEqual(Order a, Order b) {
    if (a.id != b.id ||
        a.storeId != b.storeId ||
        a.tableId != b.tableId ||
        a.tableNumber != b.tableNumber ||
        a.tableName != b.tableName ||
        a.status != b.status ||
        a.totalAmount != b.totalAmount ||
        a.taxAmount != b.taxAmount ||
        a.discountAmount != b.discountAmount ||
        a.paymentMethod != b.paymentMethod ||
        a.paymentStatus != b.paymentStatus ||
        a.createdBy != b.createdBy ||
        a.items.length != b.items.length) {
      return false;
    }

    for (int i = 0; i < a.items.length; i++) {
      final itemA = a.items[i];
      final itemB = b.items[i];
      if (itemA.itemId != itemB.itemId ||
          itemA.quantity != itemB.quantity ||
          itemA.unitPrice != itemB.unitPrice ||
          itemA.taxPercent != itemB.taxPercent ||
          itemA.notes != itemB.notes ||
          itemA.item.name != itemB.item.name ||
          itemA.item.price != itemB.item.price) {
        return false;
      }
    }

    return true;
  }

  Future<void> loadAppUpdate({String platform = 'mobile'}) async {
    try {
      _appUpdate = await _backend.api.getAppUpdate(platform: platform);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<AppUpdate?> updateAppUpdate({
    required String platform,
    required bool enabled,
    required String version,
    required String downloadUrl,
    String? releaseNotes,
  }) async {
    try {
      final update = await _backend.api.updateAppUpdate({
        'platform': platform,
        'enabled': enabled,
        'version': version,
        'downloadUrl': downloadUrl,
        'releaseNotes': releaseNotes ?? '',
      });
      _appUpdate = update;
      notifyListeners();
      return update;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    }
  }
}
