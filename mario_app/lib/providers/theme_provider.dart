import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/constants.dart';

class ThemeProvider extends ChangeNotifier {
  static const String _guestThemeKey = 'theme_pref_guest';

  String _currentThemeId = AppThemeOptions.defaultOption.id;
  String? _currentUserId;
  bool _isLoaded = false;

  String get currentThemeId => _currentThemeId;
  AppThemeOption get currentTheme => AppThemeOptions.fromId(_currentThemeId);
  ThemeData get lightTheme => AppTheme.lightThemeFor(currentTheme);
  ThemeData get darkTheme => AppTheme.darkThemeFor(currentTheme);
  List<AppThemeOption> get availableThemes => AppThemeOptions.all;

  void syncForUser(String? userId) {
    if (_isLoaded && _currentUserId == userId) {
      return;
    }
    _currentUserId = userId;
    _loadThemePreference();
  }

  Future<void> setTheme(String themeId) async {
    if (_currentThemeId == themeId) {
      return;
    }

    _currentThemeId = AppThemeOptions.fromId(themeId).id;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, _currentThemeId);
    notifyListeners();
  }

  Future<void> _loadThemePreference() async {
    final prefs = await SharedPreferences.getInstance();
    final savedThemeId = prefs.getString(_storageKey) ??
        prefs.getString(_guestThemeKey) ??
        AppThemeOptions.defaultOption.id;

    _currentThemeId = AppThemeOptions.fromId(savedThemeId).id;
    _isLoaded = true;
    notifyListeners();
  }

  String get _storageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestThemeKey;
    }
    return 'theme_pref_user_$_currentUserId';
  }
}
