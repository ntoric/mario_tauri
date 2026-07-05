import 'package:flutter/material.dart';
import '../backend/backend_service.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../models/bill.dart';
import '../models/statistics.dart';
import '../widgets/period_filter.dart';
import 'auth_provider.dart';

class ItemSales {
  final String itemId;
  final String itemName;
  final String categoryName;
  final int quantity;
  final double revenue;

  ItemSales({
    required this.itemId,
    required this.itemName,
    required this.categoryName,
    required this.quantity,
    required this.revenue,
  });
}

class CategorySales {
  final String categoryId;
  final String categoryName;
  final int quantity;
  final double revenue;

  CategorySales({
    required this.categoryId,
    required this.categoryName,
    required this.quantity,
    required this.revenue,
  });
}

class StoreSummary {
  final String storeId;
  final String storeName;
  final double totalRevenue;
  final int totalOrders;
  final int completedOrders;
  final int activeOrders;

  StoreSummary({
    required this.storeId,
    required this.storeName,
    required this.totalRevenue,
    required this.totalOrders,
    required this.completedOrders,
    required this.activeOrders,
  });
}

class DataProvider extends ChangeNotifier {
  final BackendService _backend = BackendService();

  List<Category> _categories = [];
  List<Item> _items = [];
  List<Order> _orders = [];
  List<Bill> _bills = [];
  SystemStats? _stats;
  PeriodFilter _periodFilter = PeriodFilter.all;

  bool _isLoading = false;
  String? _error;

  List<Category> get categories => _categories;
  List<Item> get items => _items;
  List<Order> get orders => _orders;
  List<Bill> get bills => _bills;
  SystemStats? get stats => _stats;
  bool get isLoading => _isLoading;
  String? get error => _error;
  PeriodFilter get periodFilter => _periodFilter;

  void setPeriodFilter(PeriodFilter filter) {
    _periodFilter = filter;
    notifyListeners();
  }

  List<Order> get filteredOrders {
    final start = _periodFilter.startDate;
    if (start == null) return _orders;
    return _orders.where((o) => o.createdAt.isAfter(start.subtract(const Duration(seconds: 1)))).toList();
  }

  Future<void> loadStoreData(String storeId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await Future.wait([
        loadCategories(storeId),
        loadItems(storeId),
        loadOrders(storeId),
        loadBills(storeId),
      ]);
    } catch (e) {
      _error = e.toString();
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadCategories(String storeId) async {
    try {
      _categories = await _backend.api.getCategories(storeId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadItems(String storeId) async {
    try {
      _items = await _backend.api.getItems(storeId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadOrders(String storeId) async {
    try {
      _orders = await _backend.api.getOrders(storeId);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
    }
  }

  Future<void> loadBills(String storeId) async {
    try {
      _bills = await _backend.api.getBills(storeId);
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

  // ---- Computed Analytics (respect period filter) ----

  List<Order> get completedOrders =>
      filteredOrders.where((o) => o.isCompleted).toList();
  List<Order> get activeOrders =>
      filteredOrders.where((o) => o.isActive).toList();
  List<Order> get cancelledOrders =>
      filteredOrders.where((o) => o.isCancelled).toList();

  double get totalRevenue =>
      completedOrders.fold(0.0, (sum, o) => sum + o.totalAmount);

  double get totalTax =>
      completedOrders.fold(0.0, (sum, o) => sum + o.taxAmount);

  double get totalDiscount =>
      completedOrders.fold(0.0, (sum, o) => sum + o.discountAmount);

  List<Order> get parcelOrders =>
      filteredOrders.where((o) => o.isParcel).toList();

  double get avgOrderValue {
    final count = completedOrders.length;
    return count > 0 ? totalRevenue / count : 0.0;
  }

  Map<String, double> get paymentMethodBreakdown {
    final map = <String, double>{};
    for (final order in completedOrders) {
      final method = order.paymentMethod ?? 'Unknown';
      map[method] = (map[method] ?? 0) + order.totalAmount;
    }
    return map;
  }

  List<ItemSales> get salesByItem {
    final map = <String, ItemSales>{};
    for (final order in completedOrders) {
      for (final oi in order.items) {
        final key = oi.itemId;
        final existing = map[key];
        final revenue = oi.totalPrice;
        final catName = oi.item.categoryName ?? 'Uncategorized';
        if (existing != null) {
          map[key] = ItemSales(
            itemId: existing.itemId,
            itemName: existing.itemName,
            categoryName: existing.categoryName,
            quantity: existing.quantity + oi.quantity,
            revenue: existing.revenue + revenue,
          );
        } else {
          map[key] = ItemSales(
            itemId: oi.itemId,
            itemName: oi.item.name,
            categoryName: catName,
            quantity: oi.quantity,
            revenue: revenue,
          );
        }
      }
    }
    final list = map.values.toList();
    list.sort((a, b) => b.revenue.compareTo(a.revenue));
    return list;
  }

  List<CategorySales> get salesByCategory {
    final map = <String, CategorySales>{};
    for (final order in completedOrders) {
      for (final oi in order.items) {
        final catName = oi.item.categoryName ?? 'Uncategorized';
        final catId = oi.item.categoryId;
        final key = catId.isNotEmpty ? catId : catName;
        final existing = map[key];
        final revenue = oi.totalPrice;
        if (existing != null) {
          map[key] = CategorySales(
            categoryId: existing.categoryId,
            categoryName: existing.categoryName,
            quantity: existing.quantity + oi.quantity,
            revenue: existing.revenue + revenue,
          );
        } else {
          map[key] = CategorySales(
            categoryId: catId,
            categoryName: catName,
            quantity: oi.quantity,
            revenue: revenue,
          );
        }
      }
    }
    final list = map.values.toList();
    list.sort((a, b) => b.revenue.compareTo(a.revenue));
    return list;
  }

  List<SalesData> get dailySales {
    final map = <String, SalesData>{};
    for (final order in completedOrders) {
      final dateKey =
          '${order.createdAt.year}-${order.createdAt.month.toString().padLeft(2, '0')}-${order.createdAt.day.toString().padLeft(2, '0')}';
      final existing = map[dateKey];
      if (existing != null) {
        map[dateKey] = SalesData(
          date: existing.date,
          amount: existing.amount + order.totalAmount,
          orderCount: existing.orderCount + 1,
        );
      } else {
        map[dateKey] = SalesData(
          date: DateTime(order.createdAt.year, order.createdAt.month, order.createdAt.day),
          amount: order.totalAmount,
          orderCount: 1,
        );
      }
    }
    final list = map.values.toList();
    list.sort((a, b) => a.date.compareTo(b.date));
    return list;
  }

  List<SalesData> get last7DaysSales {
    final allSales = dailySales;
    final now = DateTime.now();
    final sevenDaysAgo = DateTime(now.year, now.month, now.day - 6);
    return allSales.where((s) => s.date.isAfter(sevenDaysAgo.subtract(const Duration(seconds: 1)))).toList();
  }

  List<SalesData> get last30DaysSales {
    final allSales = dailySales;
    final now = DateTime.now();
    final thirtyDaysAgo = DateTime(now.year, now.month, now.day - 29);
    return allSales.where((s) => s.date.isAfter(thirtyDaysAgo.subtract(const Duration(seconds: 1)))).toList();
  }

  double get todayRevenue {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return _orders
        .where((o) => o.isCompleted)
        .where((o) =>
            o.createdAt.isAfter(today.subtract(const Duration(seconds: 1))))
        .fold(0.0, (sum, o) => sum + o.totalAmount);
  }

  int get todayOrderCount {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return _orders
        .where((o) => o.isCompleted)
        .where((o) =>
            o.createdAt.isAfter(today.subtract(const Duration(seconds: 1))))
        .length;
  }

  // ---- All Stores Overview ----

  Future<List<StoreSummary>> loadAllStoresSummary(AuthProvider auth) async {
    final stores = auth.user?.stores ?? [];
    final summaries = <StoreSummary>[];

    for (final store in stores) {
      try {
        await _backend.api.switchStore(store.id);
        final orders = await _backend.api.getOrders(store.id);
        final revenue = orders
            .where((o) => o.isCompleted)
            .fold(0.0, (sum, o) => sum + o.totalAmount);
        summaries.add(StoreSummary(
          storeId: store.id,
          storeName: store.displayName,
          totalRevenue: revenue,
          totalOrders: orders.length,
          completedOrders: orders.where((o) => o.isCompleted).length,
          activeOrders: orders.where((o) => o.isActive).length,
        ));
      } catch (e) {
        summaries.add(StoreSummary(
          storeId: store.id,
          storeName: store.displayName,
          totalRevenue: 0,
          totalOrders: 0,
          completedOrders: 0,
          activeOrders: 0,
        ));
      }
    }

    if (auth.currentStore != null) {
      await _backend.api.switchStore(auth.currentStore!.id);
    }

    return summaries;
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
