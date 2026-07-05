import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../models/bill.dart';
import '../models/statistics.dart';

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

  // Bills
  Future<List<Bill>> getBills(String storeId) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/bills?storeId=$storeId'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return (data as List).map((b) => Bill.fromJson(b)).toList();
  }

  // Users
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

  // System Stats
  Future<SystemStats> getSystemStats() async {
    final response = await http.get(
      Uri.parse('$_baseUrl/system/stats'),
      headers: _headers,
    );
    final data = await _handleResponse(response);
    return SystemStats.fromJson(data);
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
