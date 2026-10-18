import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/constants.dart';

class ThemeProvider extends ChangeNotifier {
  static const String _guestThemeKey = 'theme_pref_guest';
  static const String _guestModeKey = 'theme_mode_guest';

  String _currentThemeId = AppThemeOptions.defaultOption.id;
  ThemeMode _themeMode = ThemeMode.system;
  String? _currentUserId;
  bool _isLoaded = false;

  ThemeProvider() {
    // Rebuild when the OS brightness flips while following the system.
    PlatformDispatcher.instance.onPlatformBrightnessChanged = () {
      if (_themeMode == ThemeMode.system) {
        notifyListeners();
      }
    };
  }

  String get currentThemeId => _currentThemeId;
  AppThemeOption get currentTheme => AppThemeOptions.fromId(_currentThemeId);
  ThemeMode get themeMode => _themeMode;
  ThemeData get lightTheme => AppTheme.lightThemeFor(currentTheme);
  ThemeData get darkTheme => AppTheme.darkThemeFor(currentTheme);
  List<AppThemeOption> get availableThemes => AppThemeOptions.all;

  /// Resolves the effective brightness for the current mode.
  bool isDarkMode([Brightness? platformBrightness]) {
    final platform =
        platformBrightness ?? PlatformDispatcher.instance.platformBrightness;
    return _themeMode == ThemeMode.dark ||
        (_themeMode == ThemeMode.system && platform == Brightness.dark);
  }

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
    AppColors.apply(currentTheme);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeStorageKey, _currentThemeId);
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    if (_themeMode == mode) {
      return;
    }

    _themeMode = mode;
    AppColors.setDarkMode(isDarkMode());
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_modeStorageKey, mode.name);
    notifyListeners();
  }

  Future<void> _loadThemePreference() async {
    final prefs = await SharedPreferences.getInstance();
    final savedThemeId = prefs.getString(_themeStorageKey) ??
        prefs.getString(_guestThemeKey) ??
        AppThemeOptions.defaultOption.id;

    _currentThemeId = AppThemeOptions.fromId(savedThemeId).id;
    AppColors.apply(currentTheme);

    final savedMode =
        prefs.getString(_modeStorageKey) ?? prefs.getString(_guestModeKey);
    _themeMode = ThemeMode.values.asNameMap()[savedMode] ?? ThemeMode.system;
    AppColors.setDarkMode(isDarkMode());

    _isLoaded = true;
    notifyListeners();
  }

  String get _themeStorageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestThemeKey;
    }
    return 'theme_pref_user_$_currentUserId';
  }

  String get _modeStorageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestModeKey;
    }
    return 'theme_mode_user_$_currentUserId';
  }
}
