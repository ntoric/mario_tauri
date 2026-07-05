import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

export '../services/api_service.dart';

class BackendService {
  static final BackendService _instance = BackendService._internal();
  factory BackendService() => _instance;
  BackendService._internal();

  final ApiService _api = ApiService();

  String? _currentToken;
  Map<String, dynamic>? _currentUser;

  Future<void> initialize() async {
    await _api.init();
    _currentToken = _api.token;
  }

  ApiService get api => _api;

  Future<bool> connectToBackend(String baseUrl) async {
    await _api.saveBaseUrl(baseUrl);
    return await _api.checkHealth();
  }

  Future<void> disconnect() async {
    await _api.clearToken();
    _currentToken = null;
    _currentUser = null;
  }

  Future<bool> get isConnected => _api.checkHealth();

  String? get currentToken => _currentToken;
  Map<String, dynamic>? get currentUser => _currentUser;

  set currentToken(String? token) {
    _currentToken = token;
    if (token != null) {
      _api.setToken(token);
    }
  }

  Future<bool> login(String username, String password) async {
    try {
      final result = await _api.login(username, password);
      if (result['token'] != null) {
        _currentToken = result['token'];
        _currentUser = result['user'];
        return true;
      }
      return false;
    } catch (e) {
      print('Login error: $e');
      rethrow;
    }
  }

  Future<bool> validateToken() async {
    if (_currentToken == null) return false;
    try {
      final user = await _api.getMe();
      _currentUser = {
        'id': user.id,
        'username': user.username,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'storeId': user.storeId,
        'storeName': user.storeName,
      };
      return true;
    } catch (e) {
      return false;
    }
  }

  void logout() {
    _api.clearToken();
    _currentToken = null;
    _currentUser = null;
  }

  String? get currentUserId => _currentUser?['id'];
  String? get currentUserRole => _currentUser?['role'];
  String? get currentStoreId => _currentUser?['storeId'];
}
