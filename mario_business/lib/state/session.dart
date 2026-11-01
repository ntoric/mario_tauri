import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/config.dart';
import '../core/date_range.dart';
import '../data/owner_repository.dart';
import '../models/store.dart';
import '../models/user.dart';

enum AuthStatus {
  /// Checking a saved session with the server at launch.
  restoring,
  /// A saved session exists but the server couldn't be reached.
  offline,
  signedOut,
  signingIn,
  signedIn,
}

/// Where the session token is kept between launches: Keychain on iOS,
/// encrypted storage on Android. The session itself lives in Redis on the
/// server (24h sliding expiry), so a stolen copy can be revoked there.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage]) : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _kToken = 'session_token';
  static const _kTokenUrl = 'session_token_url';

  /// Returns the saved token only if it was issued by [baseUrl].
  Future<String?> read(String baseUrl) async {
    try {
      final token = await _storage.read(key: _kToken);
      final url = await _storage.read(key: _kTokenUrl);
      if (token == null || token.isEmpty || url != baseUrl) return null;
      return token;
    } catch (_) {
      // Corrupt keystore entries (e.g. after a backup restore) - start fresh.
      await clear();
      return null;
    }
  }

  Future<void> write(String token, String baseUrl) async {
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kTokenUrl, value: baseUrl);
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _kToken);
      await _storage.delete(key: _kTokenUrl);
    } catch (_) {}
  }
}

/// Signed-in owner, their assigned stores, the store being viewed, and the
/// reporting period shared by every screen.
class Session extends ChangeNotifier {
  Session(this._prefs, this.repo, {TokenStore? tokens}) : _tokens = tokens ?? TokenStore() {
    repo.api.onUnauthorized = _onUnauthorized;
  }

  static const _kUsername = 'last_username';
  static const _kStore = 'selected_store';

  final SharedPreferences _prefs;
  final OwnerRepository repo;
  final TokenStore _tokens;

  AuthStatus _status = AuthStatus.restoring;
  AppUser? _user;
  List<Store> _stores = const [];
  Store? _store;
  DateRange _range = DateRange.preset(RangePreset.today);
  String? _notice;

  AuthStatus get status => _status;
  AppUser? get user => _user;
  List<Store> get stores => _stores;
  Store? get store => _store;
  /// Presets like "Today" are recomputed on read so a session left open
  /// overnight never shows yesterday's numbers as today's.
  DateRange get range => _range.preset == RangePreset.custom ? _range : DateRange.preset(_range.preset);

  /// One-off message for the login screen (e.g. "session expired").
  String? takeNotice() {
    final n = _notice;
    _notice = null;
    return n;
  }

  String get lastUsername => _prefs.getString(_kUsername) ?? '';

  /// Resumes the saved session, if any. Called once at launch.
  Future<void> restore() async {
    final token = await _tokens.read(repo.api.baseUrl);
    if (token == null) {
      _status = AuthStatus.signedOut;
      notifyListeners();
      return;
    }
    _status = AuthStatus.restoring;
    notifyListeners();
    repo.api.token = token;
    try {
      final u = await repo.me();
      if (u.role != AppConfig.ownerRole) {
        await signOut();
        return;
      }
      _user = u;
      _applyStores(u.stores);
      _status = AuthStatus.signedIn;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.isUnauthorized || e.isForbidden) {
        // Expired or revoked on the server.
        _notice = 'Your session has expired. Please sign in again.';
        await _tokens.clear();
        _clear();
      } else {
        // Network trouble: keep the token so Retry can resume it.
        _status = AuthStatus.offline;
        notifyListeners();
      }
    }
  }

  Future<void> signIn(String username, String password) async {
    _status = AuthStatus.signingIn;
    notifyListeners();
    try {
      final res = await repo.login(username.trim(), password);
      if (res.user.role != AppConfig.ownerRole) {
        repo.api.token = res.token;
        await repo.logout();
        repo.api.token = null;
        throw const ApiException('This app is only for business owners. Staff and admins should use the Mario POS app.');
      }
      repo.api.token = res.token;
      repo.clearCache();
      await _tokens.write(res.token, repo.api.baseUrl);
      await _prefs.setString(_kUsername, username.trim());
      _user = res.user;
      _applyStores(res.user.stores);
      _status = AuthStatus.signedIn;
      notifyListeners();
    } catch (_) {
      _status = AuthStatus.signedOut;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> signOut({String? notice}) async {
    await repo.logout();
    await _tokens.clear();
    _notice = notice;
    _clear();
  }

  /// After a password change the server revokes every session, so just drop
  /// the local copy.
  Future<void> endAfterPasswordChange() async {
    await _tokens.clear();
    _notice = 'Password changed. Sign in with your new password.';
    _clear();
  }

  void _onUnauthorized() {
    if (_status != AuthStatus.signedIn) return;
    _notice = 'Your session has expired. Please sign in again.';
    _tokens.clear();
    _clear();
  }

  void _clear() {
    repo.api.token = null;
    repo.clearCache();
    _user = null;
    _stores = const [];
    _store = null;
    _status = AuthStatus.signedOut;
    notifyListeners();
  }

  /// Re-reads the owner's profile so store assignment changes made by the
  /// superadmin show up without signing out.
  Future<void> refreshStores() async {
    final u = await repo.me();
    _user = u;
    repo.clearCache();
    _applyStores(u.stores);
    notifyListeners();
  }

  /// [list] is the owner's assigned stores from login or /auth/me. The server
  /// already drops inactive stores there, and those rows carry only id, name
  /// and branch (isActive is not filled in), so they are used as-is.
  void _applyStores(List<Store> list) {
    _stores = [...list]..sort((a, b) => a.displayName.compareTo(b.displayName));
    final saved = _store?.id ?? _prefs.getString(_kStore);
    _store = _stores.where((s) => s.id == saved).firstOrNull ?? _stores.firstOrNull;
    _loadStoreDetails();
  }

  /// Fills in logos, GSTIN and other details from /stores. Best effort: the
  /// app works with the basic rows if this fails.
  Future<void> _loadStoreDetails() async {
    final ids = _stores.map((s) => s.id).toSet();
    if (ids.isEmpty) return;
    try {
      final full = await repo.stores(force: true);
      final byId = {for (final s in full) if (ids.contains(s.id)) s.id: s};
      // Ignore the result if the session changed while loading.
      if (byId.isEmpty || _stores.map((s) => s.id).toSet().difference(ids).isNotEmpty) return;
      _stores = [for (final s in _stores) byId[s.id] ?? s]..sort((a, b) => a.displayName.compareTo(b.displayName));
      if (_store != null) _store = byId[_store!.id] ?? _store;
      notifyListeners();
    } catch (_) {}
  }

  void selectStore(Store s) {
    if (_store?.id == s.id) return;
    _store = s;
    _prefs.setString(_kStore, s.id);
    notifyListeners();
  }

  void setRange(DateRange r) {
    if (r == _range && r.preset == _range.preset) return;
    _range = r;
    notifyListeners();
  }
}
