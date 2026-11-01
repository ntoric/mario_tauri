import '../core/api_client.dart';
import '../core/config.dart';
import '../core/date_range.dart';
import '../models/catalog.dart';
import '../models/json.dart';
import '../models/reports.dart';
import '../models/sales.dart';
import '../models/store.dart';
import '../models/user.dart';

class _CacheEntry {
  final DateTime at;
  final Future<dynamic> value;
  _CacheEntry(this.at, this.value);
}

/// Every read the owner app makes. All calls are read-only: this app never
/// creates or changes orders, bills, or menu data.
///
/// Store access is enforced by the backend (`storeId` is checked against
/// the stores the superadmin assigned to this owner), so a store the owner
/// lost access to returns 403 instead of data.
class OwnerRepository {
  OwnerRepository(this.api);

  final ApiClient api;
  final Map<String, _CacheEntry> _cache = {};

  void clearCache() => _cache.clear();

  /// Memoises in-flight and recent requests so switching tabs is instant.
  /// Failed requests are evicted so the next visit retries.
  Future<T> _cached<T>(String key, bool force, Future<T> Function() load) {
    final hit = _cache[key];
    if (!force && hit != null && DateTime.now().difference(hit.at) < AppConfig.cacheTtl) {
      return hit.value.then((v) => v as T);
    }
    final future = load();
    _cache[key] = _CacheEntry(DateTime.now(), future);
    future.catchError((_) {
      if (identical(_cache[key]?.value, future)) _cache.remove(key);
      return Future<T>.error('evicted');
    }).ignore();
    return future;
  }

  // ---------------------------------------------------------------- auth

  Future<({String token, AppUser user})> login(String username, String password) async {
    final res = asMap(await api.post('/auth/login', body: {'username': username, 'password': password}));
    return (token: jStr(res, 'token'), user: AppUser.fromJson(asMap(res['user'])));
  }

  Future<AppUser> me() async => AppUser.fromJson(asMap(await api.get('/auth/me')));

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Logging out locally is enough if the server is unreachable.
    }
  }

  Future<void> changePassword(String current, String next) async {
    await api.post('/users/change-password', body: {'currentPassword': current, 'newPassword': next});
  }

  // -------------------------------------------------------------- stores

  Future<List<Store>> stores({bool force = false}) =>
      _cached('stores', force, () async => asList(await api.get('/stores'), Store.fromJson));

  Future<Store> store(String id, {bool force = false}) =>
      _cached('store:$id', force, () async => Store.fromJson(asMap(await api.get('/stores/$id'))));

  /// Accounts visible to the owner (used to show staff names on bills).
  Future<List<StaffUser>> users({bool force = false}) =>
      _cached('users', force, () async => asList(await api.get('/users'), StaffUser.fromJson));

  /// id → display name. Resolves to an empty map if the call fails so
  /// reports still render (falling back to "Staff").
  Future<Map<String, String>> userNames({bool force = false}) async {
    try {
      final list = await users(force: force);
      return {for (final u in list) u.id: u.displayName};
    } catch (_) {
      return const {};
    }
  }

  // ------------------------------------------------------------- reports

  Map<String, String> _q(String storeId, DateRange r, [Map<String, String?> extra = const {}]) => {
        'storeId': storeId,
        'startDate': r.startParam,
        'endDate': r.endParam,
        for (final e in extra.entries)
          if (e.value != null) e.key: e.value!,
      };

  /// Totals plus every bill (with items) and expense in the range.
  Future<RevenueReport> revenue(String storeId, DateRange r, {bool force = false}) =>
      _cached('rev:$storeId:${r.key}', force, () async {
        return RevenueReport.fromJson(asMap(await api.get('/reports/revenue', query: _q(storeId, r))));
      });

  /// Totals only — cheap enough to run per store for comparisons.
  Future<RevenueReport> revenueSummary(String storeId, DateRange r, {bool force = false}) =>
      _cached('revsum:$storeId:${r.key}', force, () async {
        return RevenueReport.fromJson(
            asMap(await api.get('/reports/revenue', query: _q(storeId, r, {'summaryOnly': 'true'}))));
      });

  Future<SalesProfitReport> salesProfit(String storeId, DateRange r, {bool force = false}) =>
      _cached('sp:$storeId:${r.key}', force, () async {
        return SalesProfitReport.fromJson(asMap(await api.get('/reports/sales-profit',
            query: _q(storeId, r, {'all': 'true', 'sort': 'revenue', 'dir': 'desc'}))));
      });

  Future<CategorySalesReport> categorySales(String storeId, DateRange r, {bool force = false}) =>
      _cached('cs:$storeId:${r.key}', force, () async {
        return CategorySalesReport.fromJson(asMap(await api.get('/reports/top-selling-categories',
            query: _q(storeId, r, {'all': 'true', 'sort': 'date', 'dir': 'asc'}))));
      });

  Future<MenuProfitReport> menuProfit(String storeId, {bool force = false}) =>
      _cached('mp:$storeId', force, () async {
        return MenuProfitReport.fromJson(asMap(await api.get('/reports/menu-profit',
            query: {'storeId': storeId, 'all': 'true', 'sort': 'profitPercent', 'dir': 'desc'})));
      });

  Future<List<ExpenseByCategory>> expensesByCategory(String storeId, DateRange r, {bool force = false}) =>
      _cached('ec:$storeId:${r.key}', force, () async {
        final res = asMap(await api.get('/reports/expenses-by-category', query: _q(storeId, r, {'all': 'true'})));
        final rows = jList(res, 'chartRows', ExpenseByCategory.fromJson);
        return (rows.isNotEmpty ? rows : jList(res, 'rows', ExpenseByCategory.fromJson))
          ..sort((a, b) => b.amount.compareTo(a.amount));
      });

  Future<GstSummary> gstSummary(String storeId, DateRange r, {bool force = false}) =>
      _cached('gst:$storeId:${r.key}', force, () async {
        return GstSummary.fromJson(asMap(await api.get('/reports/gst/summary', query: _q(storeId, r))));
      });

  // ------------------------------------------------------ orders & bills

  /// Orders in the range (read-only monitoring). The API caps one request
  /// at 1000 rows.
  Future<List<Order>> orders(String storeId, DateRange r, {String? status, bool force = false}) =>
      _cached('ord:$storeId:${r.key}:$status', force, () async {
        return asList(
          await api.get('/orders', query: {
            'storeId': storeId,
            'from': r.startParam,
            'to': r.endParam,
            'status': status,
            'limit': '1000',
          }),
          Order.fromJson,
        )..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      });

  /// Orders currently open on the floor (not yet billed).
  Future<List<Order>> liveOrders(String storeId, {bool force = false}) =>
      _cached('live:$storeId', force, () async {
        return asList(
          await api.get('/orders', query: {'storeId': storeId, 'status': 'active', 'limit': '200'}),
          Order.fromJson,
        )..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      });

  Future<Bill> bill(String id) async => Bill.fromJson(asMap(await api.get('/bills/$id')));

  // ------------------------------------------------------------- catalog

  Future<List<Category>> categories(String storeId, {bool force = false}) =>
      _cached('cat:$storeId', force, () async {
        return asList(await api.get('/categories', query: {'storeId': storeId}), Category.fromJson)
          ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      });

  Future<List<MenuItem>> items(String storeId, {bool force = false}) =>
      _cached('items:$storeId', force, () async {
        return asList(
            await api.get('/items', query: {'storeId': storeId, 'includeProfit': 'true'}), MenuItem.fromJson);
      });
}
