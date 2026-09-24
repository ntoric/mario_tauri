import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../backend/backend_service.dart';
import '../models/user.dart';
import '../services/discovery_service.dart';

class AuthProvider extends ChangeNotifier {
  final BackendService _backend = BackendService();

  User? _user;
  Store? _currentStore;
  bool _isLoading = false;
  String? _error;
  bool _isAuthenticated = false;
  bool _isBackendConnected = false;
  bool _autoConnecting = false;
  Timer? _reconnectTimer;

  User? get user => _user;
  Store? get currentStore => _currentStore;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _isAuthenticated;
  bool get isBackendConnected => _isBackendConnected;
  BackendService get backend => _backend;

  bool get canViewStats =>
    _user?.role == 'superadmin' || _user?.role == 'business_owner' || _user?.role == 'business_admin';

  Store? _resolveCurrentStore(User user) {
    final stores = user.stores;
    if (stores == null || stores.isEmpty) return null;

    if (user.storeId != null) {
      for (final store in stores) {
        if (store.id == user.storeId) {
          return store;
        }
      }
    }

    return stores.first;
  }

  Future<void> initialize() async {
    await _backend.initialize();

    // Try to load saved base URL and check connection
    final prefs = await SharedPreferences.getInstance();
    final savedUrl = prefs.getString('api_url');

    if (savedUrl != null) {
      try {
        final connected = await _backend.connectToBackend(savedUrl);
        _isBackendConnected = connected;
      } catch (e) {
        _isBackendConnected = false;
        print('Backend connection error on startup: $e');
      }
    }

    // If the saved host is unreachable (e.g. its IP changed), scan the LAN
    // for the same serverId or the only available host.
    if (!_isBackendConnected) {
      await _autoDiscoverAndConnect();
    }

    // Keep retrying in the background so the app reconnects automatically
    // when it joins the same network as the host machine.
    _startAutoReconnect();

    // Try to load saved token
    final savedToken = prefs.getString('auth_token');

    if (_isBackendConnected && savedToken != null) {
      try {
        _backend.currentToken = savedToken;
        final isValid = await _backend.validateToken();
        if (isValid) {
          final meData = Map<String, dynamic>.from(_backend.currentUser!);
          try {
            final stores = await _backend.api.getStores();
            meData['stores'] = stores.map((s) => s.toJson()).toList();
          } catch (_) {
            // Keep session restore resilient; some payloads already include stores.
          }

          _user = User.fromJson(meData);
          _isAuthenticated = true;
          _currentStore = _resolveCurrentStore(_user!);
        }
      } catch (e) {
        _isAuthenticated = false;
        print('Token validation error on startup: $e');
      }
    }

    notifyListeners();
  }

  Future<void> refreshUser() async {
    if (!_isAuthenticated) return;

    try {
      final meData = Map<String, dynamic>.from(_backend.currentUser!);
      final stores = await _backend.api.getStores();
      meData['stores'] = stores.map((s) => s.toJson()).toList();

      _user = User.fromJson(meData);
      _currentStore = _resolveCurrentStore(_user!);
      notifyListeners();
    } catch (e) {
      print('Failed to refresh user: $e');
    }
  }

  /// Scan the LAN for the last-used host (matched by serverId, immune to IP
  /// changes) or the single available host, and connect automatically.
  Future<bool> _autoDiscoverAndConnect() async {
    if (_autoConnecting) return _isBackendConnected;
    _autoConnecting = true;
    try {
      final servers =
          await DiscoveryService.scan(timeout: const Duration(seconds: 2));
      if (servers.isEmpty) return _isBackendConnected;

      final savedId = _backend.lastServerId;
      DiscoveredServer? target;
      if (savedId != null) {
        for (final s in servers) {
          if (s.serverId == savedId) {
            target = s;
            break;
          }
        }
      }
      // If nothing was saved or it wasn't found, only auto-connect when the
      // choice is unambiguous (exactly one host on the network).
      target ??= servers.length == 1 ? servers.first : null;
      if (target == null) return _isBackendConnected;

      final connected = await _backend.connectToBackend(target.apiUrl);
      if (connected != _isBackendConnected) {
        _isBackendConnected = connected;
        notifyListeners();
      }
      return connected;
    } catch (e) {
      print('Auto-discover failed: $e');
      return _isBackendConnected;
    } finally {
      _autoConnecting = false;
    }
  }

  /// Periodically retries the saved URL, then LAN discovery, while
  /// disconnected — so the app reconnects by itself once it reaches the
  /// host's network again.
  void _startAutoReconnect() {
    _reconnectTimer ??=
        Timer.periodic(const Duration(seconds: 20), (_) async {
      if (_autoConnecting) return;

      // Detect a lost connection mid-session so we can reconnect below.
      if (_isBackendConnected) {
        try {
          _isBackendConnected = await _backend.isConnected;
          if (!_isBackendConnected) notifyListeners();
        } catch (_) {
          _isBackendConnected = false;
          notifyListeners();
        }
        return;
      }

      // Cheap path first: retry the last known URL.
      try {
        if (await _backend.connectToBackend(_backend.api.baseUrl)) {
          _isBackendConnected = true;
          notifyListeners();
          return;
        }
      } catch (_) {}
      await _autoDiscoverAndConnect();
    });
  }

  Future<bool> connectBackend(String baseUrl) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final connected = await _backend.connectToBackend(baseUrl);
      _isBackendConnected = connected;

      if (!connected) {
        _error = 'Failed to connect to backend. Please check the URL.';
      }

      _isLoading = false;
      notifyListeners();
      return connected;
    } catch (e) {
      _error = 'Backend connection error: ${e.toString()}';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> login(String username, String password) async {
    if (!_isBackendConnected) {
      _error = 'Backend not connected. Please configure backend URL first.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final success = await _backend.login(username, password);

      if (success) {
        _user = User.fromJson(_backend.currentUser!);
        _isAuthenticated = true;
        _currentStore = _resolveCurrentStore(_user!);

        // Save token
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', _backend.currentToken!);
      } else {
        _error = 'Invalid username or password';
      }

      _isLoading = false;
      notifyListeners();
      return success;
    } catch (e) {
      // Preserve the error message from the backend
      final errorMessage = e.toString().replaceFirst('Exception: ', '');
      _error = errorMessage;
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    _backend.logout();
    _user = null;
    _currentStore = null;
    _isAuthenticated = false;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');

    notifyListeners();
  }

  Future<void> switchStore(Store store) async {
    try {
      final result = await _backend.api.switchStore(store.id);
      _currentStore = result;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<bool> changePassword(String currentPassword, String newPassword) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      await _backend.api.changePassword(currentPassword, newPassword);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  void setBaseUrl(String url) {
    // Not used in local backend mode
  }

  String get baseUrl => _backend.api.baseUrl;
}
