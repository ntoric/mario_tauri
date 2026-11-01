import 'package:flutter/material.dart';

/// A selectable accent theme for the app chrome (buttons, highlights,
/// single-series charts).
class AccentTheme {
  final String id;
  final String name;
  final Color light;
  final Color dark;
  const AccentTheme(this.id, this.name, this.light, this.dark);

  Color of(Brightness b) => b == Brightness.dark ? dark : light;
}

const accentThemes = <AccentTheme>[
  AccentTheme('indigo', 'Indigo', Color(0xFF4F46E5), Color(0xFF818CF8)),
  AccentTheme('ocean', 'Ocean', Color(0xFF2A78D6), Color(0xFF5598E7)),
  AccentTheme('emerald', 'Emerald', Color(0xFF059669), Color(0xFF34D399)),
  AccentTheme('teal', 'Teal', Color(0xFF0D9488), Color(0xFF2DD4BF)),
  AccentTheme('mario', 'Mario Orange', Color(0xFFEA580C), Color(0xFFFB923C)),
  AccentTheme('rose', 'Rose', Color(0xFFE11D48), Color(0xFFFB7185)),
  AccentTheme('violet', 'Violet', Color(0xFF7C3AED), Color(0xFFA78BFA)),
  AccentTheme('graphite', 'Graphite', Color(0xFF334155), Color(0xFFCBD5E1)),
];

AccentTheme accentById(String? id) => accentThemes.firstWhere((a) => a.id == id, orElse: () => accentThemes.first);

/// Categorical colours for multi-series charts (donuts, splits). Fixed
/// order, validated for colour-vision deficiency on adjacent pairs; light
/// and dark steps are tuned separately for each surface. Never cycled —
/// charts fold anything past these into "Other".
class ChartPalette {
  ChartPalette._();

  static const _light = [
    Color(0xFF2A78D6), // blue
    Color(0xFFEB6834), // orange
    Color(0xFF1BAF7A), // aqua
    Color(0xFFEDA100), // yellow
    Color(0xFFE87BA4), // magenta
    Color(0xFF008300), // green
    Color(0xFF6250D6), // violet
    Color(0xFFE34948), // red
  ];
  static const _dark = [
    Color(0xFF3987E5),
    Color(0xFFD95926),
    Color(0xFF199E70),
    Color(0xFFC98500),
    Color(0xFFD55181),
    Color(0xFF008300),
    Color(0xFF9085E9),
    Color(0xFFE66767),
  ];

  static const maxSeries = 6; // top 5 + "Other" in part-to-whole charts

  static Color series(int i, Brightness b) => (b == Brightness.dark ? _dark : _light)[i % 8];

  /// Neutral used for the "Other" bucket so it never reads as a series.
  static Color other(Brightness b) => b == Brightness.dark ? const Color(0xFF6B6B66) : const Color(0xFFB4B2AA);
}

/// Status colours: only for meaning (up/down, good/bad), always shown with
/// an icon or sign, never used as a series colour.
class StatusColors {
  StatusColors._();
  static const good = Color(0xFF0CA30C);
  static const goodText = Color(0xFF087A08);
  static const goodTextDark = Color(0xFF4ADE80);
  static const warning = Color(0xFFFAB219);
  static const critical = Color(0xFFD03B3B);
  static const criticalTextDark = Color(0xFFF87171);

  static Color up(Brightness b) => b == Brightness.dark ? goodTextDark : goodText;
  static Color down(Brightness b) => b == Brightness.dark ? criticalTextDark : critical;
}
