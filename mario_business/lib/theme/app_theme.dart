import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'palettes.dart';

/// Extra semantic colours the Material scheme doesn't cover.
class AppColors extends ThemeExtension<AppColors> {
  final Color background;
  final Color card;
  final Color cardAlt;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color grid;
  final Color accent;
  final Color accentSoft;

  const AppColors({
    required this.background,
    required this.card,
    required this.cardAlt,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.grid,
    required this.accent,
    required this.accentSoft,
  });

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      background: l(background, other.background),
      card: l(card, other.card),
      cardAlt: l(cardAlt, other.cardAlt),
      border: l(border, other.border),
      textPrimary: l(textPrimary, other.textPrimary),
      textSecondary: l(textSecondary, other.textSecondary),
      textMuted: l(textMuted, other.textMuted),
      grid: l(grid, other.grid),
      accent: l(accent, other.accent),
      accentSoft: l(accentSoft, other.accentSoft),
    );
  }
}

extension AppThemeX on BuildContext {
  AppColors get colors => Theme.of(this).extension<AppColors>()!;
  TextTheme get text => Theme.of(this).textTheme;
  Brightness get brightness => Theme.of(this).brightness;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

class AppTheme {
  AppTheme._();

  static ThemeData build(AccentTheme accentTheme, Brightness brightness, {bool trueBlack = false}) {
    final dark = brightness == Brightness.dark;
    final accent = accentTheme.of(brightness);

    final colors = dark
        ? AppColors(
            background: trueBlack ? Colors.black : const Color(0xFF0E1013),
            card: trueBlack ? const Color(0xFF0D0D0F) : const Color(0xFF171A1F),
            cardAlt: trueBlack ? const Color(0xFF161618) : const Color(0xFF1F232A),
            border: trueBlack ? const Color(0xFF232327) : const Color(0xFF262A31),
            textPrimary: const Color(0xFFF2F3F5),
            textSecondary: const Color(0xFFB4B8C0),
            textMuted: const Color(0xFF7D828C),
            grid: const Color(0xFF262A31),
            accent: accent,
            accentSoft: accent.withValues(alpha: 0.16),
          )
        : AppColors(
            background: const Color(0xFFF5F6F8),
            card: Colors.white,
            cardAlt: const Color(0xFFF0F2F5),
            border: const Color(0xFFE6E8EC),
            textPrimary: const Color(0xFF111318),
            textSecondary: const Color(0xFF4E535C),
            textMuted: const Color(0xFF8A8F98),
            grid: const Color(0xFFEDEFF2),
            accent: accent,
            accentSoft: accent.withValues(alpha: 0.10),
          );

    final scheme = ColorScheme.fromSeed(seedColor: accentTheme.light, brightness: brightness).copyWith(
      primary: accent,
      onPrimary: dark && accent.computeLuminance() > 0.4 ? const Color(0xFF0E1013) : Colors.white,
      surface: colors.card,
      onSurface: colors.textPrimary,
      onSurfaceVariant: colors.textSecondary,
      outline: colors.border,
      outlineVariant: colors.border,
      surfaceContainerLowest: colors.background,
      surfaceContainerLow: colors.card,
      surfaceContainer: colors.card,
      surfaceContainerHigh: colors.cardAlt,
      surfaceContainerHighest: colors.cardAlt,
      surfaceTint: Colors.transparent,
    );

    final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme);
    final textTheme = GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: colors.textPrimary,
      displayColor: colors.textPrimary,
    );

    final radius = BorderRadius.circular(14);

    return base.copyWith(
      scaffoldBackgroundColor: colors.background,
      textTheme: textTheme.copyWith(
        headlineMedium: textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5),
        headlineSmall: textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4),
        titleLarge: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
        titleMedium: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        titleSmall: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
        labelLarge: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        bodySmall: textTheme.bodySmall?.copyWith(color: colors.textSecondary),
      ),
      extensions: [colors],
      appBarTheme: AppBarTheme(
        backgroundColor: colors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        foregroundColor: colors.textPrimary,
        titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
        systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: colors.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: colors.border)),
      ),
      dividerTheme: DividerThemeData(color: colors.border, thickness: 1, space: 1),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: colors.accentSoft,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith(
          (s) => IconThemeData(color: s.contains(WidgetState.selected) ? accent : colors.textMuted, size: 24),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (s) => textTheme.labelSmall?.copyWith(
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? colors.textPrimary : colors.textMuted,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.cardAlt,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: colors.border)),
        focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: accent, width: 1.6)),
        hintStyle: TextStyle(color: colors.textMuted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: radius),
          textStyle: textTheme.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          side: BorderSide(color: colors.border),
          shape: RoundedRectangleBorder(borderRadius: radius),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: colors.card,
        selectedColor: colors.accentSoft,
        side: BorderSide(color: colors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        labelStyle: textTheme.labelMedium?.copyWith(color: colors.textSecondary, fontWeight: FontWeight.w600),
        secondaryLabelStyle: textTheme.labelMedium?.copyWith(color: accent, fontWeight: FontWeight.w700),
        checkmarkColor: accent,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.card,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: colors.border,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: colors.textSecondary,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          side: WidgetStatePropertyAll(BorderSide(color: colors.border)),
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: radius)),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.textPrimary,
        unselectedLabelColor: colors.textMuted,
        indicatorColor: accent,
        dividerColor: Colors.transparent,
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        unselectedLabelStyle: textTheme.labelLarge,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: accent),
    );
  }
}
