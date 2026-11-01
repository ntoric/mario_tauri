import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'palettes.dart';

/// Appearance preferences, persisted across launches.
class ThemeController extends ChangeNotifier {
  ThemeController(this._prefs) {
    _mode = ThemeMode.values.firstWhere((m) => m.name == _prefs.getString(_kMode), orElse: () => ThemeMode.system);
    _accent = accentById(_prefs.getString(_kAccent));
    _trueBlack = _prefs.getBool(_kBlack) ?? false;
    _compactNumbers = _prefs.getBool(_kCompact) ?? false;
  }

  static const _kMode = 'theme_mode';
  static const _kAccent = 'theme_accent';
  static const _kBlack = 'theme_true_black';
  static const _kCompact = 'compact_numbers';

  final SharedPreferences _prefs;
  late ThemeMode _mode;
  late AccentTheme _accent;
  late bool _trueBlack;
  late bool _compactNumbers;

  ThemeMode get mode => _mode;
  AccentTheme get accent => _accent;
  bool get trueBlack => _trueBlack;

  /// Show ₹1.2L instead of ₹1,20,000 on headline tiles.
  bool get compactNumbers => _compactNumbers;

  set mode(ThemeMode m) {
    _mode = m;
    _prefs.setString(_kMode, m.name);
    notifyListeners();
  }

  set accent(AccentTheme a) {
    _accent = a;
    _prefs.setString(_kAccent, a.id);
    notifyListeners();
  }

  set trueBlack(bool v) {
    _trueBlack = v;
    _prefs.setBool(_kBlack, v);
    notifyListeners();
  }

  set compactNumbers(bool v) {
    _compactNumbers = v;
    _prefs.setBool(_kCompact, v);
    notifyListeners();
  }
}
