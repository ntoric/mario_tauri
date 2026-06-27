import 'dart:convert';
import 'package:http/http.dart' as http;
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

  String _baseUrl = 'https://mario-v2-backend.ntoric.com/api';
  String? _token;

  void setBaseUrl(String url) {
    _baseUrl = url;
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    // final savedUrl = prefs.getString('api_url');
    // if (savedUrl != null) {
    //   _baseUrl = savedUrl;
    // }
    await prefs.setString('api_url', _baseUrl);
  }

  Future<void> saveBaseUrl(String url) async {
    _baseUrl = url;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('api_url', url);
  }

  String get baseUrl => _baseUrl;

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
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }

  String? get token => _token;

  Future<void> clearToken() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
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
    final response = await http.post(
      Uri.parse('$_baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    final data = await _handleResponse(response);
    if (data['token'] != null) {
      await setToken(data['token']);
    }
    return data;
  }

  Future<User> getMe() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/auth/me'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return User.fromJson(data);
  }

  // Stores
  Future<List<Store>> getStores() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/stores'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((s) => Store.fromJson(s)).toList();
  }

  Future<Store> switchStore(String storeId) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/stores/switch'),
      headers: _headers,
      body: jsonEncode({'storeId': storeId}),
    );
    final data = await _handleResponse(response);
    return Store.fromJson(data['store']);
  }

  // Tables
  Future<List<TableModel>> getTables(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/tables?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((t) => TableModel.fromJson(t)).toList();
  }

  // Categories
  Future<List<Category>> getCategories(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/categories?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((c) => Category.fromJson(c)).toList();
  }

  // Items
  Future<List<Item>> getItems(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/items?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((i) => Item.fromJson(i)).toList();
  }

  // Orders
  Future<List<Order>> getOrders(String storeId, {String? status}) async {
    var url = '$_baseUrl/orders?storeId=$storeId';
    if (status != null) {
      url += '&status=$status';
    }
    final response = await http.get(
      Uri.parse(url),
      headers: _headers,
    );
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
      final response = await http.post(
        Uri.parse('$_baseUrl/orders'),
        headers: _headers,
        body: jsonEncode(orderData),
      );

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
      final response = await http.post(
        Uri.parse('$_baseUrl/orders/parcel'),
        headers: _headers,
        body: jsonEncode(orderData),
      );

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
    final response = await http.put(
      Uri.parse('$_baseUrl/orders/$orderId'),
      headers: _headers,
      body: jsonEncode(orderData),
    );
    final data = await _handleResponse(response);
    return Order.fromJson(data);
  }

  Future<void> completeOrder(String orderId, {String? paymentMethod}) async {
    await http.patch(
      Uri.parse('$_baseUrl/orders/$orderId/complete'),
      headers: _headers,
      body: jsonEncode({'paymentMethod': paymentMethod}),
    );
  }

  Future<void> cancelOrder(String orderId) async {
    await http.patch(
      Uri.parse('$_baseUrl/orders/$orderId/cancel'),
      headers: _headers,
    );
  }

  // Bills
  Future<List<Bill>> getBills(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/bills?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((b) => Bill.fromJson(b)).toList();
  }

  Future<String> getNextInvoiceNo(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/bills/next-invoice-no?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return data['invoiceNo'];
  }

  Future<Bill> createBill(Map<String, dynamic> billData) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/bills'),
      headers: _headers,
      body: jsonEncode(billData),
    );
    final data = await _handleResponse(response);
    return Bill.fromJson(data);
  }

  Future<void> enqueueBill(Map<String, dynamic> billData) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/bills/queue'),
      headers: _headers,
      body: jsonEncode(billData),
    );
    final data = await _handleResponse(response);
    print(data);
  }

  Future<List<Map<String, dynamic>>> getBillQueue(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/bills/queue?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List)
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  // Users
  Future<List<User>> getUsers() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/users'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((u) => User.fromJson(u)).toList();
  }

  Future<void> changePassword(
      String currentPassword, String newPassword) async {
    await http.post(
      Uri.parse('$_baseUrl/users/change-password'),
      headers: _headers,
      body: jsonEncode({
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      }),
    );
  }

  // System Stats (Superadmin only)
  Future<SystemStats> getSystemStats() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/system/stats'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return SystemStats.fromJson(data);
  }

  // App Update
  Future<AppUpdate?> getAppUpdate({String platform = 'mobile'}) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/app-update?platform=$platform'),
        headers: _headers,
      );
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
      final response = await http.post(
        Uri.parse('$_baseUrl/app-update'),
        headers: _headers,
        body: jsonEncode(updateData),
      );
      final data = await _handleResponse(response);
      return AppUpdate.fromJson(data['update'] ?? data);
    } catch (e) {
      rethrow;
    }
  }

  // Health Check
  Future<bool> checkHealth() async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/health'),
        headers: _headers,
      );
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
