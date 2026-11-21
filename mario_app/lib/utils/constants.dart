import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppConstants {
  static const String appName = 'Mario App';
  static const String appVersion = '2.3.0';

  static const String defaultApiUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mario-api.ntoric.com',
  );
}

class AppColors {
  // Gooseroot brand tokens, mirrored from gooseroot-ui/tokens.json.
  // Light is primary: neutral grey page, white cards, red accents.
  // Dark: near-black surfaces, red accents.
  static AppThemeOption _theme = AppThemeOptions.defaultOption;
  static bool _isDark = false;

  static AppThemeOption get theme => _theme;
  static void apply(AppThemeOption option) => _theme = option;

  /// True while the app renders in dark mode. Synced from MaterialApp's
  /// resolved brightness so widgets reading these statics follow the theme.
  static bool get isDark => _isDark;
  static void setDarkMode(bool value) => _isDark = value;

  // --- Brand gradient (theme-driven; follows the accent color) ---

  static Color get gradStart => _theme.gradStart; // Scarlet
  static Color get gradMid => _theme.primary; // Gooseroot Red
  static Color get gradEnd => _theme.gradEnd; // Crimson

  /// 135° brand gradient: hero surfaces, promo cards.
  static LinearGradient get brandGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [gradStart, gradMid, gradEnd],
        stops: const [0.0, 0.45, 1.0],
      );

  /// 180° rail gradient: the sidebar / nav rail.
  static LinearGradient get railGradient => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [gradStart, gradMid, gradEnd],
        stops: const [0.0, 0.45, 1.0],
      );

  /// grad-mid → grad-end: buttons, badges and fills (keeps white text at
  /// 4.5:1 contrast).
  static LinearGradient get buttonGradient => LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [gradMid, gradEnd],
      );

  // --- Accent ---

  /// Links, active nav, icons, focus, progress. Flips to the lighter
  /// accent in dark mode for contrast on near-black surfaces.
  static Color get primary => _isDark ? _theme.primaryLight : _theme.primary;
  static Color get primaryDark => _isDark
      ? Color.lerp(_theme.primaryLight, Colors.white, 0.18)!
      : _theme.primaryDark;
  static Color get primaryLight => _isDark
      ? Color.lerp(_theme.primaryLight, Colors.white, 0.18)!
      : _theme.primaryLight;

  /// Selected rows, icon wells, soft badges, hover on ghost items.
  static Color get tint => _isDark ? _theme.tintDark : _theme.primarySoft;
  static Color get primarySoft => tint;

  // --- Surfaces ---

  /// Page background behind cards.
  static Color get background =>
      _isDark ? const Color(0xFF0B0A0B) : _theme.background;

  /// Cards, panels, header, modals.
  static Color get surface =>
      _isDark ? const Color(0xFF161314) : const Color(0xFFFFFFFF);

  /// Subtle fills: inputs, secondary rows inside a card.
  static Color get surface2 =>
      _isDark ? const Color(0xFF1D191A) : const Color(0xFFFAFAFA);
  static Color get backgroundSecondary => surface2;

  static Color get gray100 => surface;
  static Color get gray200 => surface2;
  static Color get clayPink => tint;
  static Color get clayBlue => tint;
  static Color get clayPeach => tint;

  // --- Lines ---

  /// Hairline borders and dividers on surface.
  static Color get line =>
      _isDark ? const Color(0xFF2C2627) : const Color(0xFFEBE9EA);

  /// Input borders, control outlines.
  static Color get lineStrong =>
      _isDark ? const Color(0xFF463C3E) : const Color(0xFFDAD6D7);

  // --- Text ---

  /// Headings and key numbers.
  static Color get heading =>
      _isDark ? const Color(0xFFFFFFFF) : const Color(0xFF4A0010);

  /// Body text.
  static Color get text =>
      _isDark ? const Color(0xFFECE4E5) : const Color(0xFF3F3638);

  /// Secondary text, captions, meta.
  static Color get muted =>
      _isDark ? const Color(0xFFB3A6A8) : const Color(0xFF6F6466);

  /// Deep Wine: strong neutral fill (dark buttons, toasts). Replaces black.
  static const Color secondary = Color(0xFF5C0012);
  static Color get ink =>
      _isDark ? const Color(0xFFFFF4F4) : const Color(0xFF5C0012);
  static Color get onInk =>
      _isDark ? const Color(0xFF161314) : const Color(0xFFFFFFFF);

  static Color get dark => heading;
  static const Color darker = Color(0xFF0B0A0B);
  static const Color light = Color(0xFFFFFFFF);

  static Color get gray300 => lineStrong;
  static Color get gray400 =>
      _isDark ? const Color(0xFF8A7C7E) : const Color(0xFFADA0A2);
  static Color get gray500 => muted;
  static Color get gray600 => muted;
  static Color get gray700 => text;
  static Color get gray800 => text;

  // --- States ---
  // `success` is the only green in the brand and only means done/positive.
  // `warning` maps to Deep Wine (the palette has no amber), `info` follows
  // the primary accent. Kept const where call sites need const expressions.
  static const Color success = Color(0xFF0E7A4E);
  static const Color warning = Color(0xFF5C0012);
  static const Color danger = Color(0xFFC2183A);
  static Color get info => primary;
  static Color get successTint =>
      _isDark ? const Color(0xFF0F2A20) : const Color(0xFFE3F5EC);
  static Color get dangerTint =>
      _isDark ? const Color(0xFF2E1116) : const Color(0xFFFFF0F2);
  static Color get overlay =>
      Colors.black.withOpacity(_isDark ? 0.65 : 0.5);

  static const Color cardDark = Color(0xFF161314);
  static const Color cardDarkLight = Color(0xFF1D191A);
}

/// Gooseroot surface language: flat white cards floating on a tinted page,
/// generous radii and soft wine-tinted shadows (replaces the old claymorphic
/// dual-shadow look). Names kept so existing call sites re-skin in place.
class ClayStyles {
  static BorderRadius radius([double value = 28]) =>
      BorderRadius.circular(value);

  /// Wine-tinted shadow source (rgba(92,0,18,a)) in light mode; neutral
  /// black shadows in dark mode.
  static const Color _shadowWine = Color(0xFF5C0012);

  /// shadow-xs — inputs, chips.
  static List<BoxShadow> get shadowXs => [
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.30)
              : _shadowWine.withOpacity(0.06),
          blurRadius: 2,
          offset: const Offset(0, 1),
        ),
      ];

  /// shadow-sm — cards at rest.
  static List<BoxShadow> get shadowSm => [
        ...shadowXs,
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.25)
              : _shadowWine.withOpacity(0.06),
          blurRadius: 24,
          offset: const Offset(0, 8),
        ),
      ];

  /// shadow-md — raised items: hovered cards, dropdowns, focused rows.
  static List<BoxShadow> get shadowMd => [
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.30)
              : _shadowWine.withOpacity(0.05),
          blurRadius: 4,
          offset: const Offset(0, 2),
        ),
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.35)
              : _shadowWine.withOpacity(0.10),
          blurRadius: 40,
          offset: const Offset(0, 18),
        ),
      ];

  /// shadow-lg — modals and popovers.
  static List<BoxShadow> get shadowLg => [
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.50)
              : _shadowWine.withOpacity(0.18),
          blurRadius: 70,
          offset: const Offset(0, 30),
        ),
      ];

  /// shadow-red — primary button hover, rail active item, promo cards.
  static List<BoxShadow> get shadowRed => [
        BoxShadow(
          color: AppColors.primary.withOpacity(AppColors.isDark ? 0.25 : 0.28),
          blurRadius: 28,
          offset: const Offset(0, 12),
        ),
      ];

  /// Legacy name kept for call sites — now resolves to the brand's soft
  /// wine-tinted shadow (small contact shadow + ambient).
  static List<BoxShadow> raisedShadow({
    Color? darkShadow,
    Color? lightShadow,
    double blur = 24,
    Offset darkOffset = const Offset(0, 8),
    Offset lightOffset = const Offset(0, 1),
  }) {
    final bool isDark = AppColors.isDark;
    return [
      BoxShadow(
        color: lightShadow ??
            (isDark
                ? Colors.black.withOpacity(0.30)
                : _shadowWine.withOpacity(0.05)),
        blurRadius: 2,
        offset: const Offset(0, 1),
      ),
      BoxShadow(
        color: darkShadow ??
            (isDark
                ? Colors.black.withOpacity(0.25)
                : _shadowWine.withOpacity(0.08)),
        blurRadius: blur,
        offset: darkOffset,
      ),
    ];
  }

  /// Flat surface kept as a gradient for callers that explicitly need one.
  static LinearGradient surfaceGradient({Color? top, Color? bottom}) {
    final Color base = AppColors.surface;
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [top ?? base, bottom ?? base],
    );
  }

  static LinearGradient insetGradient({Color? top, Color? bottom}) {
    final Color base = AppColors.surface2;
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [top ?? base, bottom ?? base],
    );
  }

  /// Brand card: flat `surface` with `shadow-sm` (gr-card).
  static BoxDecoration surface({
    double radiusValue = 28,
    Color? color,
    Gradient? gradient,
    List<BoxShadow>? boxShadow,
    Border? border,
  }) {
    return BoxDecoration(
      color: gradient == null ? (color ?? AppColors.surface) : null,
      gradient: gradient,
      borderRadius: radius(radiusValue),
      border: border,
      boxShadow: boxShadow ?? shadowSm,
    );
  }

  /// Subtle inset fill: `surface-2` with a `line` border (gr-inner).
  static BoxDecoration inset({
    double radiusValue = 20,
    Color? color,
    Border? border,
  }) {
    return BoxDecoration(
      color: color ?? AppColors.surface2,
      borderRadius: radius(radiusValue),
      border: border ?? Border.all(color: AppColors.line, width: 1),
      boxShadow: shadowXs,
    );
  }

  /// Tinted accent fill for selected rows, chips and nav items.
  static BoxDecoration accent({
    required Color accent,
    double radiusValue = 20,
    double opacity = 0.18,
  }) {
    final bool isDark = AppColors.isDark;
    return BoxDecoration(
      color: accent.withOpacity(isDark ? opacity + 0.10 : opacity),
      borderRadius: radius(radiusValue),
      border: Border.all(color: accent.withOpacity(0.22)),
    );
  }

  /// Brand-gradient card (gr-card--brand): promo panels, hero surfaces.
  static BoxDecoration brandCard({
    double radiusValue = 28,
    List<BoxShadow>? boxShadow,
  }) {
    return BoxDecoration(
      gradient: AppColors.brandGradient,
      borderRadius: radius(radiusValue),
      boxShadow: boxShadow ?? shadowRed,
    );
  }

  /// Icon well (gr-well): `primary` icon on `tint`, or white icon on the
  /// button gradient for the primary feature.
  static BoxDecoration well({double radiusValue = 14, bool brand = false}) {
    return BoxDecoration(
      color: brand ? null : AppColors.tint,
      gradient: brand ? AppColors.buttonGradient : null,
      borderRadius: radius(radiusValue),
      boxShadow: brand ? shadowRed : null,
    );
  }
}

class AppThemeOption {
  final String id;
  final String label;
  final String description;
  final Color primary;
  final Color primaryDark;
  final Color primaryLight;
  final Color primarySoft;
  final Color background;
  final Color backgroundSecondary;
  final Color cardColor;
  final Color accentTint;
  final Color gradStart;
  final Color gradEnd;
  final Color tintDark;

  const AppThemeOption({
    required this.id,
    required this.label,
    required this.description,
    required this.primary,
    required this.primaryDark,
    required this.primaryLight,
    required this.primarySoft,
    required this.background,
    required this.backgroundSecondary,
    required this.cardColor,
    required this.accentTint,
    required this.gradStart,
    required this.gradEnd,
    required this.tintDark,
  });

  /// Derives a full brand palette from a custom accent hue. The accent
  /// becomes grad-mid/primary, the gradient ends lighten and darken around
  /// it, and soft tints take on the hue so every surface stays coherent.
  AppThemeOption withAccent(Color accent) {
    final hsl = HSLColor.fromColor(accent);
    final l = hsl.lightness;
    Color shift(double delta) =>
        hsl.withLightness((l + delta).clamp(0.0, 1.0)).toColor();
    final soft = Color.lerp(Colors.white, accent, 0.12)!;
    return AppThemeOption(
      id: 'accent_${accent.toARGB32().toRadixString(16)}',
      label: label,
      description: description,
      primary: accent,
      primaryDark: shift(-0.10),
      primaryLight: shift(0.14),
      primarySoft: soft,
      background: background,
      backgroundSecondary: backgroundSecondary,
      cardColor: cardColor,
      accentTint: soft,
      gradStart: shift(0.07),
      gradEnd: shift(-0.11),
      tintDark: Color.lerp(const Color(0xFF161314), accent, 0.18)!,
    );
  }
}

class AppThemeOptions {
  /// The single Gooseroot brand theme. The brand palette forbids other
  /// accent hues (no orange, blue, purple or decorative green), so the only
  /// appearance choice left is light/dark/system mode.
  static const gooseroot = AppThemeOption(
    id: 'gooseroot',
    label: 'Gooseroot',
    description: 'Signature red and deep wine',
    primary: Color(0xFFD4031A),
    primaryDark: Color(0xFFB8002E),
    primaryLight: Color(0xFFFF4B3E),
    primarySoft: Color(0xFFFDEEF0),
    background: Color(0xFFF4F4F5),
    backgroundSecondary: Color(0xFFFAFAFA),
    cardColor: Color(0xFFFFFFFF),
    accentTint: Color(0xFFFDEEF0),
    gradStart: Color(0xFFF0140A),
    gradEnd: Color(0xFFB8002E),
    tintDark: Color(0xFF2A1C1F),
  );

  static const List<AppThemeOption> all = [gooseroot];

  static const AppThemeOption defaultOption = gooseroot;

  static AppThemeOption fromId(String id) {
    for (final option in all) {
      if (option.id == id) {
        return option;
      }
    }
    return defaultOption;
  }
}

/// Preset accent hues offered in Settings → Appearance. The first swatch in
/// the UI is the Gooseroot brand default (resets the accent); these are the
/// alternates. Each derives a full palette via `AppThemeOption.withAccent`.
class AppAccentOptions {
  static const List<Color> presets = [
    Color(0xFF5C0012), // Deep Wine
    Color(0xFF2F6FED), // Blue
    Color(0xFF0E8A8A), // Teal
    Color(0xFF2F9E68), // Green
    Color(0xFF7C4DD8), // Purple
    Color(0xFFE8720C), // Orange
    Color(0xFFD63384), // Pink
    Color(0xFF45506A), // Slate
  ];
}

class AppTheme {
  static ThemeData get lightTheme =>
      lightThemeFor(AppThemeOptions.defaultOption);
  static ThemeData lightThemeFor(AppThemeOption option) =>
      _build(option, dark: false);

  static ThemeData get darkTheme => darkThemeFor(AppThemeOptions.defaultOption);
  static ThemeData darkThemeFor(AppThemeOption option) =>
      _build(option, dark: true);

  /// Gooseroot component theme. Token values are literals per brightness —
  /// the dark theme may be built while `AppColors.isDark` still reports the
  /// previous brightness, so it must not read brightness-flipping getters.
  static ThemeData _build(AppThemeOption option, {required bool dark}) {
    final Color primary =
        dark ? option.primaryLight : option.primary; // accent token
    final Color buttonFill = option.primary; // grad-mid fill
    final Color bg = dark ? const Color(0xFF0B0A0B) : option.background;
    final Color surface =
        dark ? const Color(0xFF161314) : option.cardColor;
    final Color surface2 =
        dark ? const Color(0xFF1D191A) : option.backgroundSecondary;
    final Color tint = dark ? option.tintDark : option.primarySoft;
    final Color line =
        dark ? const Color(0xFF2C2627) : const Color(0xFFEBE9EA);
    final Color lineStrong =
        dark ? const Color(0xFF463C3E) : const Color(0xFFDAD6D7);
    final Color heading =
        dark ? const Color(0xFFFFFFFF) : const Color(0xFF4A0010);
    final Color text =
        dark ? const Color(0xFFECE4E5) : const Color(0xFF3F3638);
    final Color muted =
        dark ? const Color(0xFFB3A6A8) : const Color(0xFF6F6466);
    final Color ink =
        dark ? const Color(0xFFFFF4F4) : const Color(0xFF5C0012);
    final Color onInk =
        dark ? const Color(0xFF161314) : const Color(0xFFFFFFFF);
    const Color danger = Color(0xFFC2183A);

    return ThemeData(
      useMaterial3: true,
      brightness: dark ? Brightness.dark : Brightness.light,
      fontFamily: 'Poppins',
      primaryColor: primary,
      scaffoldBackgroundColor: bg,
      colorScheme: dark
          ? ColorScheme.dark(
              primary: primary,
              secondary: primary,
              surface: surface,
              background: bg,
              error: danger,
              onPrimary: Colors.white,
              onSecondary: Colors.white,
              onSurface: heading,
              onBackground: heading,
              onError: Colors.white,
            )
          : ColorScheme.light(
              primary: primary,
              secondary: primary,
              surface: surface,
              background: bg,
              error: danger,
              onPrimary: Colors.white,
              onSecondary: Colors.white,
              onSurface: heading,
              onBackground: heading,
              onError: Colors.white,
            ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: heading,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness:
              dark ? Brightness.light : Brightness.dark,
        ),
      ),
      iconTheme: IconThemeData(color: muted, size: 22),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(28),
        ),
        color: surface,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(28),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: surface,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(14),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ink,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(14),
        ),
        contentTextStyle: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: onInk,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: buttonFill,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size(64, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(14),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Poppins',
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: heading,
          backgroundColor: surface,
          side: BorderSide(color: lineStrong, width: 1),
          minimumSize: const Size(64, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(14),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Poppins',
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          textStyle: const TextStyle(
            fontFamily: 'Poppins',
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: ClayStyles.radius(10),
          borderSide: BorderSide(color: lineStrong),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(10),
          borderSide: BorderSide(color: lineStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(10),
          borderSide: BorderSide(color: primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(10),
          borderSide: const BorderSide(color: danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(10),
          borderSide: const BorderSide(color: danger, width: 1.5),
        ),
        labelStyle: TextStyle(color: muted, fontSize: 13),
        hintStyle: TextStyle(color: muted.withOpacity(0.8), fontSize: 14),
        prefixIconColor: muted,
        suffixIconColor: muted,
      ),
      textTheme: TextTheme(
        // gr-h1: page greeting / title
        displayLarge: TextStyle(
          fontSize: 34,
          height: 40 / 34,
          fontWeight: FontWeight.w700,
          color: heading,
          letterSpacing: -0.85,
        ),
        // gr-h2: section and modal titles
        displayMedium: TextStyle(
          fontSize: 24,
          height: 30 / 24,
          fontWeight: FontWeight.w700,
          color: heading,
          letterSpacing: -0.48,
        ),
        // gr-h3: card titles
        displaySmall: TextStyle(
          fontSize: 18,
          height: 24 / 18,
          fontWeight: FontWeight.w700,
          color: heading,
          letterSpacing: -0.18,
        ),
        headlineMedium: TextStyle(
          fontSize: 18,
          height: 24 / 18,
          fontWeight: FontWeight.w700,
          color: heading,
          letterSpacing: -0.18,
        ),
        // gr-label: buttons, row titles, form labels
        titleMedium: TextStyle(
          fontSize: 14,
          height: 20 / 14,
          fontWeight: FontWeight.w500,
          color: heading,
        ),
        // body-lg: lead paragraphs
        bodyLarge: TextStyle(
          fontSize: 16,
          height: 26 / 16,
          fontWeight: FontWeight.w400,
          color: text,
        ),
        // body: default UI text
        bodyMedium: TextStyle(
          fontSize: 14,
          height: 22 / 14,
          fontWeight: FontWeight.w400,
          color: text,
        ),
        // caption: meta text, timestamps, helper text
        bodySmall: TextStyle(
          fontSize: 12,
          height: 18 / 12,
          fontWeight: FontWeight.w400,
          color: muted,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          height: 20 / 14,
          fontWeight: FontWeight.w500,
          color: heading,
        ),
        // overline: uppercase eyebrows in primary
        labelSmall: TextStyle(
          fontSize: 11,
          height: 16 / 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.54,
          color: primary,
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        selectedItemColor: primary,
        unselectedItemColor: muted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: buttonFill,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: primary,
        unselectedLabelColor: muted,
        indicatorColor: primary,
        labelStyle: const TextStyle(
          fontFamily: 'Poppins',
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
        unselectedLabelStyle: const TextStyle(
          fontFamily: 'Poppins',
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
      dividerTheme: DividerThemeData(
        color: line,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: surface2,
        selectedColor: tint,
        labelStyle: TextStyle(color: heading),
        secondaryLabelStyle: TextStyle(color: primary),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(999),
        ),
      ),
    );
  }
}

class AppSizes {
  static const double paddingSmall = 8.0;
  static const double paddingMedium = 16.0;
  static const double paddingLarge = 24.0;
  static const double paddingXLarge = 32.0;

  static const double radiusSmall = 10.0;
  static const double radiusMedium = 14.0;
  static const double radiusLarge = 20.0;
  static const double radiusXLarge = 28.0;
  static const double radiusXXLarge = 40.0;

  static const double elevationSmall = 2.0;
  static const double elevationMedium = 4.0;
  static const double elevationLarge = 8.0;
}

class ResponsiveHelper {
  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < 600;

  static bool isTablet(BuildContext context) =>
      MediaQuery.of(context).size.width >= 600 &&
      MediaQuery.of(context).size.width < 1200;

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= 1200;

  static int getGridCrossAxisCount(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width < 400) return 2;
    if (width < 600) return 3;
    if (width < 900) return 4;
    if (width < 1200) return 5;
    return 6;
  }

  static double getCardWidth(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    if (width < 600) return width * 0.45;
    if (width < 900) return width * 0.3;
    if (width < 1200) return width * 0.22;
    return 220;
  }
}

class VersionHelper {
  /// Compares two semantic version strings (e.g., "1.2.3")
  /// Returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
  static int compareVersions(String v1, String v2) {
    final parts1 = v1.split('.').map(int.parse).toList();
    final parts2 = v2.split('.').map(int.parse).toList();

    // Pad with zeros if versions have different lengths
    while (parts1.length < 3) parts1.add(0);
    while (parts2.length < 3) parts2.add(0);

    for (int i = 0; i < 3; i++) {
      if (parts1[i] < parts2[i]) return -1;
      if (parts1[i] > parts2[i]) return 1;
    }
    return 0;
  }

  /// Returns true if the latest version is newer than the current version
  static bool isNewerVersion(String current, String latest) {
    return compareVersions(current, latest) < 0;
  }
}

/// Nightly pause window: between 00:30 and 07:30 IST all background polling
/// must be skipped (the backend pauses its workers in the same window).
bool isQuietHours([DateTime? now]) {
  final t = (now ?? DateTime.now())
      .toUtc()
      .add(const Duration(hours: 5, minutes: 30));
  final mins = t.hour * 60 + t.minute;
  return mins >= 30 && mins < 450;
}
