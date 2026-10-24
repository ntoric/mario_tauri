import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../models/table.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../models/bill.dart';
import '../models/statistics.dart';
import '../models/app_update.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String _baseUrl = 'https://mario-api.ntoric.com/api';
  String? _token;

  // Session tokens are Bearer credentials, so they live in the platform
  // keystore (Keychain on iOS, Keystore on Android) rather than plain
  // SharedPreferences.
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  static const String _tokenKey = 'auth_token';

  // A single long-lived client keeps TCP/TLS connections alive across
  // requests instead of paying a fresh handshake on every call.
  final http.Client _client = http.Client();
  static const Duration _requestTimeout = Duration(seconds: 15);

  void setBaseUrl(String url) {
    _baseUrl = url;
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    // final savedUrl = prefs.getString('api_url');
    // if (savedUrl != null) {
    //   _baseUrl = savedUrl;
    // }
    await prefs.setString('api_url', _baseUrl);
    // Remove any token persisted in SharedPreferences by older builds.
    await prefs.remove('auth_token');
    // Restore the session token so a cold start stays logged in; the
    // token is validated against the server by AuthProvider.initialize().
    _token = await _secureStorage.read(key: _tokenKey);
  }

  Future<void> saveBaseUrl(String url) async {
    _baseUrl = url;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_url', url);
  }

  String get baseUrl => _baseUrl;

  Future<http.Response> _get(String url) =>
      _client.get(Uri.parse(url), headers: _headers).timeout(_requestTimeout);

  Future<http.Response> _post(String url, [Object? body]) => _client
      .post(
        Uri.parse(url),
        headers: _headers,
        body: body == null ? null : jsonEncode(body),
      )
      .timeout(_requestTimeout);

  Future<http.Response> _put(String url, Object body) => _client
      .put(Uri.parse(url), headers: _headers, body: jsonEncode(body))
      .timeout(_requestTimeout);

  Future<http.Response> _patch(String url, Object body) => _client
      .patch(Uri.parse(url), headers: _headers, body: jsonEncode(body))
      .timeout(_requestTimeout);

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
    };
    if (_token != null) {
      headers['Authorization'] = 'Bearer $_token';
    }
    return headers;
  }

  Future<void> setToken(String token) async {
    _token = token;
    await _secureStorage.write(key: _tokenKey, value: token);
  }

  String? get token => _token;

  Future<void> clearToken() async {
    _token = null;
    await _secureStorage.delete(key: _tokenKey);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  /// Invalidates the server-side session, then clears the local token.
  Future<void> logout() async {
    try {
      await _post('$_baseUrl/auth/logout');
    } catch (_) {
      // Best-effort: local cleanup proceeds regardless.
    }
    await clearToken();
  }

  Future<dynamic> _handleResponse(http.Response response) async {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await clearToken();
      throw Exception('Session expired. Please login again.');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['error'] ?? 'Request failed');
    }
  }

  // Auth
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await _post(
      '$_baseUrl/auth/login',
      {'username': username, 'password': password},
    );
    final data = await _handleResponse(response);
    if (data['token'] != null) {
      await setToken(data['token']);
    }
    return data;
  }

  Future<User> getMe() async {
    final response = await _get('$_baseUrl/auth/me');
    final data = await _handleResponse(response);
    return User.fromJson(data);
  }

  // Stores
  Future<List<Store>> getStores() async {
    final response = await _get('$_baseUrl/stores');
    final data = await _handleResponse(response);
    return (data as List).map((s) => Store.fromJson(s)).toList();
  }

  Future<Store> switchStore(String storeId) async {
    final response = await _post(
      '$_baseUrl/stores/switch',
      {'storeId': storeId},
    );
    final data = await _handleResponse(response);
    return Store.fromJson(data['store']);
  }

  // Tables
  Future<List<TableModel>> getTables(String storeId) async {
    final response = await _get('$_baseUrl/tables?storeId=$storeId');
    final data = await _handleResponse(response);
    return (data as List).map((t) => TableModel.fromJson(t)).toList();
  }

  // Table sections — the store's catalog of named table groupings.
  Future<List<TableSection>> getTableSections(String storeId) async {
    final response =
        await _get('$_baseUrl/tables/sections?storeId=$storeId');
    final data = await _handleResponse(response);
    return (data as List).map((s) => TableSection.fromJson(s)).toList();
  }

  // Categories
  Future<List<Category>> getCategories(String storeId) async {
    final response = await _get('$_baseUrl/categories?storeId=$storeId');
    final data = await _handleResponse(response);
    return (data as List).map((c) => Category.fromJson(c)).toList();
  }

  // Items
  Future<List<Item>> getItems(String storeId) async {
    final response = await _get('$_baseUrl/items?storeId=$storeId');
    final data = await _handleResponse(response);
    return (data as List).map((i) => Item.fromJson(i)).toList();
  }

  // Orders
  Future<List<Order>> getOrders(
    String storeId, {
    String? status,
    DateTime? from,
    DateTime? to,
    int? limit,
  }) async {
    var url = '$_baseUrl/orders?storeId=$storeId';
    if (status != null) {
      url += '&status=${Uri.encodeQueryComponent(status)}';
    }
    if (from != null) {
      url += '&from=${from.toUtc().toIso8601String()}';
    }
    if (to != null) {
      url += '&to=${to.toUtc().toIso8601String()}';
    }
    if (limit != null) {
      url += '&limit=$limit';
    }
    final response = await _get(url);
    final data = await _handleResponse(response);
    return (data as List).map((o) => Order.fromJson(o)).toList();
  }

  // Future<Order> createOrder(Map<String, dynamic> orderData) async {
  //   final response = await http.post(
  //     Uri.parse('$_baseUrl/orders'),
  //     headers: _headers,
  //     body: jsonEncode(orderData),
  //   );
  //   final data = await _handleResponse(response);
  //   return Order.fromJson(data);
  // }
  Future<Order> createOrder(Map<String, dynamic> orderData) async {
    try {
      final response = await _post('$_baseUrl/orders', orderData);

      print("STATUS CODE: ${response.statusCode}");
      print("RAW RESPONSE:");
      print(response.body);

      final data = await _handleResponse(response);

      print("PARSED RESPONSE:");
      print(data);

      return Order.fromJson(data['order'] ?? data);
    } catch (e, stack) {
      print("API CREATE ORDER ERROR:");
      print(e);
      print(stack);
      rethrow;
    }
  }

  Future<Order> createParcelOrder(Map<String, dynamic> orderData) async {
    try {
      final response = await _post('$_baseUrl/orders/parcel', orderData);

      print("STATUS CODE: ${response.statusCode}");
      print("RAW RESPONSE:");
      print(response.body);

      final data = await _handleResponse(response);

      print("PARSED RESPONSE:");
      print(data);

      return Order.fromJson(data['order'] ?? data);
    } catch (e, stack) {
      print("API CREATE PARCEL ORDER ERROR:");
      print(e);
      print(stack);
      rethrow;
    }
  }

  Future<Order> updateOrder(
      String orderId, Map<String, dynamic> orderData) async {
    final response = await _put('$_baseUrl/orders/$orderId', orderData);
    final data = await _handleResponse(response);
    return Order.fromJson(data);
  }

  Future<void> completeOrder(String orderId, {String? paymentMethod}) async {
    await _patch(
      '$_baseUrl/orders/$orderId/complete',
      {'paymentMethod': paymentMethod},
    );
  }

  Future<void> cancelOrder(String orderId, {String? reason}) async {
    await _patch(
      '$_baseUrl/orders/$orderId/cancel',
      {'reason': reason},
    );
  }

  /// Folds [mergeOrderId]'s items/totals into [orderId]; the merged order's
  /// table is released so a single bill can be generated for [orderId].
  Future<Order> mergeOrders(String orderId, String mergeOrderId) async {
    final response = await _post(
      '$_baseUrl/orders/$orderId/merge',
      {'mergeOrderId': mergeOrderId},
    );
    final data = await _handleResponse(response);
    return Order.fromJson(data);
  }

  // Bills
  Future<List<Bill>> getBills(
    String storeId, {
    DateTime? from,
    DateTime? to,
    int? limit,
  }) async {
    var url = '$_baseUrl/bills?storeId=$storeId';
    if (from != null) {
      url += '&from=${from.toUtc().toIso8601String()}';
    }
    if (to != null) {
      url += '&to=${to.toUtc().toIso8601String()}';
    }
    if (limit != null) {
      url += '&limit=$limit';
    }
    final response = await _get(url);
    final data = await _handleResponse(response);
    return (data as List).map((b) => Bill.fromJson(b)).toList();
  }

  Future<String> getNextInvoiceNo(String storeId) async {
    final response =
        await _get('$_baseUrl/bills/next-invoice-no?storeId=$storeId');
    final data = await _handleResponse(response);
    return data['invoiceNo'];
  }

  Future<Bill> createBill(Map<String, dynamic> billData) async {
    final response = await _post('$_baseUrl/bills', billData);
    final data = await _handleResponse(response);
    return Bill.fromJson(data);
  }

  Future<void> enqueueBill(Map<String, dynamic> billData) async {
    final response = await _post('$_baseUrl/bills/queue', billData);
    final data = await _handleResponse(response);
    print(data);
  }

  Future<List<Map<String, dynamic>>> getBillQueue(String storeId) async {
    final response = await _get('$_baseUrl/bills/queue?storeId=$storeId');
    final data = await _handleResponse(response);
    return (data as List)
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  // Users
  Future<List<User>> getUsers() async {
    final response = await _get('$_baseUrl/users');
    final data = await _handleResponse(response);
    return (data as List).map((u) => User.fromJson(u)).toList();
  }

  Future<void> changePassword(
      String currentPassword, String newPassword) async {
    await _post(
      '$_baseUrl/users/change-password',
      {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  // System Stats (Superadmin only)
  Future<SystemStats> getSystemStats() async {
    final response = await _get('$_baseUrl/system/stats');
    final data = await _handleResponse(response);
    return SystemStats.fromJson(data);
  }

  // App Update
  Future<AppUpdate?> getAppUpdate({String platform = 'mobile'}) async {
    try {
      final response = await _get('$_baseUrl/app-update?platform=$platform');
      final data = await _handleResponse(response);
      if (data['enabled'] == false) {
        return null;
      }
      return AppUpdate.fromJson(data);
    } catch (e) {
      rethrow;
    }
  }

  Future<AppUpdate> updateAppUpdate(Map<String, dynamic> updateData) async {
    try {
      final response = await _post('$_baseUrl/app-update', updateData);
      final data = await _handleResponse(response);
      return AppUpdate.fromJson(data['update'] ?? data);
    } catch (e) {
      rethrow;
    }
  }

  // Health Check
  Future<bool> checkHealth() async {
    try {
      final response = await _get('$_baseUrl/health');
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
