import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/constants.dart';

class ThemeProvider extends ChangeNotifier {
  static const String _guestThemeKey = 'theme_pref_guest';
  static const String _guestModeKey = 'theme_mode_guest';
  static const String _guestAccentKey = 'appearance_accent_guest';
  static const String _guestScaleKey = 'appearance_scale_guest';
  static const String _guestTableActionsKey = 'appearance_table_actions_guest';

  String _currentThemeId = AppThemeOptions.defaultOption.id;
  ThemeMode _themeMode = ThemeMode.system;
  int? _accentValue;
  double _fontScale = 1.0;
  bool _showTableActions = false;
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

  /// Effective theme: the base option re-tinted by the user's custom accent,
  /// or the brand default when no accent is set.
  AppThemeOption get currentTheme {
    final base = AppThemeOptions.fromId(_currentThemeId);
    final accent = _accentValue;
    return accent == null ? base : base.withAccent(Color(accent));
  }

  ThemeMode get themeMode => _themeMode;
  ThemeData get lightTheme => AppTheme.lightThemeFor(currentTheme);
  ThemeData get darkTheme => AppTheme.darkThemeFor(currentTheme);
  List<AppThemeOption> get availableThemes => AppThemeOptions.all;

  /// The user's custom accent, or null for the Gooseroot brand default.
  Color? get accentColor =>
      _accentValue == null ? null : Color(_accentValue!);
  bool get hasCustomAccent => _accentValue != null;

  /// Multiplier applied to all text via MediaQuery's text scaler.
  double get fontScale => _fontScale;

  /// Whether occupied table cards show their quick-action buttons. Off by
  /// default — the same actions are always in the press-and-hold menu.
  bool get showTableActions => _showTableActions;

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

  /// Sets a custom accent color (null resets to the Gooseroot brand red).
  Future<void> setAccentColor(Color? color) async {
    final value = color?.toARGB32();
    if (_accentValue == value) {
      return;
    }

    _accentValue = value;
    AppColors.apply(currentTheme);
    final prefs = await SharedPreferences.getInstance();
    if (value == null) {
      await prefs.remove(_accentStorageKey);
    } else {
      await prefs.setInt(_accentStorageKey, value);
    }
    notifyListeners();
  }

  /// Scales every text style in the app (0.8–1.4).
  Future<void> setFontScale(double scale) async {
    final clamped = scale.clamp(0.8, 1.4);
    if (clamped == _fontScale) {
      return;
    }

    _fontScale = clamped;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_scaleStorageKey, _fontScale);
    notifyListeners();
  }

  /// Shows or hides the quick-action buttons on occupied table cards.
  Future<void> setShowTableActions(bool show) async {
    if (_showTableActions == show) {
      return;
    }

    _showTableActions = show;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_tableActionsStorageKey, show);
    notifyListeners();
  }

  /// Restores accent and text size to the brand defaults.
  Future<void> resetAppearance() async {
    _accentValue = null;
    _fontScale = 1.0;
    AppColors.apply(currentTheme);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_accentStorageKey);
    await prefs.remove(_scaleStorageKey);
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

    _accentValue =
        prefs.getInt(_accentStorageKey) ?? prefs.getInt(_guestAccentKey);
    _fontScale = (prefs.getDouble(_scaleStorageKey) ??
            prefs.getDouble(_guestScaleKey) ??
            1.0)
        .clamp(0.8, 1.4);
    _showTableActions = prefs.getBool(_tableActionsStorageKey) ??
        prefs.getBool(_guestTableActionsKey) ??
        false;
    AppColors.apply(currentTheme);
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

  String get _accentStorageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestAccentKey;
    }
    return 'appearance_accent_user_$_currentUserId';
  }

  String get _scaleStorageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestScaleKey;
    }
    return 'appearance_scale_user_$_currentUserId';
  }

  String get _tableActionsStorageKey {
    if (_currentUserId == null || _currentUserId!.isEmpty) {
      return _guestTableActionsKey;
    }
    return 'appearance_table_actions_user_$_currentUserId';
  }
}
