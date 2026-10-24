import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppConstants {
  static const String appName = 'Mario App';
  static const String appVersion = '2.2.0';

  static const String defaultApiUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://mario-api.ntoric.com',
  );
}

class AppColors {
  // Theme-driven colors delegate to the active AppThemeOption, applied by
  // ThemeProvider whenever the user picks a theme in Settings.
  static AppThemeOption _theme = AppThemeOptions.defaultOption;
  static bool _isDark = false;

  static AppThemeOption get theme => _theme;
  static void apply(AppThemeOption option) => _theme = option;

  /// True while the app renders in dark mode. Synced from MaterialApp's
  /// resolved brightness so widgets reading these statics follow the theme.
  static bool get isDark => _isDark;
  static void setDarkMode(bool value) => _isDark = value;

  /// Blends a hint of the theme primary into a neutral dark surface so dark
  /// mode stays subtly tinted by the selected color theme.
  static Color _darkSurface(Color base, double tint) =>
      Color.lerp(base, _theme.primary, tint)!;

  static Color get primary => _theme.primary;
  static Color get primaryDark => _theme.primaryDark;
  static Color get primaryLight => _theme.primaryLight;
  static Color get primarySoft =>
      _isDark ? _theme.primary.withOpacity(0.20) : _theme.primarySoft;
  static Color get background =>
      _isDark ? _darkSurface(const Color(0xFF131110), 0.05) : _theme.background;
  static Color get backgroundSecondary => _isDark
      ? _darkSurface(const Color(0xFF1D1815), 0.07)
      : _theme.backgroundSecondary;
  static Color get gray100 =>
      _isDark ? _darkSurface(const Color(0xFF262019), 0.08) : _theme.cardColor;
  static Color get gray200 => backgroundSecondary;
  static Color get clayPink => primarySoft;
  static Color get clayBlue => primarySoft;
  static Color get clayPeach =>
      _isDark ? _theme.primary.withOpacity(0.28) : _theme.accentTint;

  static const Color secondary = Color(0xFF1E1A17);
  static Color get dark =>
      _isDark ? const Color(0xFFF5EFE8) : const Color(0xFF151515);
  static const Color darker = Color(0xFF090909);
  static const Color light = Color(0xFFFFFFFF);
  static Color get gray300 =>
      _isDark ? const Color(0xFF4A4038) : const Color(0xFFE7D8C8);
  static Color get gray400 =>
      _isDark ? const Color(0xFF6B5F52) : const Color(0xFFD0C0B0);
  static Color get gray500 =>
      _isDark ? const Color(0xFF9A8B7A) : const Color(0xFFA89584);
  static Color get gray600 =>
      _isDark ? const Color(0xFFC4B6A4) : const Color(0xFF7A6859);
  static Color get gray700 =>
      _isDark ? const Color(0xFFDDD2C2) : const Color(0xFF4F433A);
  static Color get gray800 =>
      _isDark ? const Color(0xFFEFE7DA) : const Color(0xFF2B2622);
  static const Color success = Color(0xFF00C896);
  static const Color warning = Color(0xFFFFB547);
  static const Color danger = Color(0xFFFF6B6B);
  static const Color info = Color(0xFF4DA3FF);
  static const Color cardDark = Color(0xFF1A1613);
  static const Color cardDarkLight = Color(0xFF2B241F);
}

class ClayStyles {
  static BorderRadius radius([double value = 24]) =>
      BorderRadius.circular(value);

  static List<BoxShadow> raisedShadow({
    Color? darkShadow,
    Color? lightShadow,
    double blur = 26,
    Offset darkOffset = const Offset(14, 14),
    Offset lightOffset = const Offset(-10, -10),
  }) {
    final bool isDark = AppColors.isDark;
    return [
      BoxShadow(
        color: darkShadow ??
            (isDark ? Colors.black.withOpacity(0.45) : const Color(0x1F9B7A5B)),
        blurRadius: blur,
        offset: darkOffset,
      ),
      BoxShadow(
        color: lightShadow ??
            (isDark ? Colors.white.withOpacity(0.05) : const Color(0xCCFFFFFF)),
        blurRadius: blur,
        offset: lightOffset,
      ),
    ];
  }

  static LinearGradient surfaceGradient({
    Color? top,
    Color? bottom,
  }) {
    final bool isDark = AppColors.isDark;
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        top ??
            (isDark
                ? Color.lerp(const Color(0xFF2B241D), AppColors.primary, 0.06)!
                : const Color(0xFFFFFDFC)),
        bottom ??
            (isDark
                ? Color.lerp(const Color(0xFF1B1613), AppColors.primary, 0.06)!
                : const Color(0xFFF1E5D8)),
      ],
    );
  }

  static LinearGradient insetGradient({
    Color? top,
    Color? bottom,
  }) {
    final bool isDark = AppColors.isDark;
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        top ??
            (isDark
                ? Color.lerp(const Color(0xFF1A1512), AppColors.primary, 0.06)!
                : const Color(0xFFF0E4D7)),
        bottom ??
            (isDark
                ? Color.lerp(const Color(0xFF272019), AppColors.primary, 0.06)!
                : const Color(0xFFFFFCF8)),
      ],
    );
  }

  static BoxDecoration surface({
    double radiusValue = 24,
    Color? color,
    Gradient? gradient,
    List<BoxShadow>? boxShadow,
    Border? border,
  }) {
    return BoxDecoration(
      color: gradient == null ? (color ?? AppColors.gray100) : null,
      gradient: gradient ?? surfaceGradient(),
      borderRadius: radius(radiusValue),
      border: border,
      boxShadow: boxShadow ?? raisedShadow(),
    );
  }

  static BoxDecoration inset({
    double radiusValue = 20,
    Color? color,
    Border? border,
  }) {
    return BoxDecoration(
      color: color ?? AppColors.backgroundSecondary,
      gradient: insetGradient(),
      borderRadius: radius(radiusValue),
      border: border ??
          Border.all(
            color: Colors.white.withOpacity(AppColors.isDark ? 0.10 : 0.65),
            width: 1,
          ),
      boxShadow: [
        BoxShadow(
          color: Colors.white.withOpacity(AppColors.isDark ? 0.05 : 0.75),
          blurRadius: 16,
          offset: const Offset(-6, -6),
        ),
        BoxShadow(
          color: AppColors.isDark
              ? Colors.black.withOpacity(0.35)
              : AppColors.gray500.withOpacity(0.10),
          blurRadius: 16,
          offset: const Offset(8, 8),
        ),
      ],
    );
  }

  static BoxDecoration accent({
    required Color accent,
    double radiusValue = 20,
    double opacity = 0.18,
  }) {
    return BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          accent.withOpacity(opacity + 0.08),
          accent.withOpacity(opacity),
        ],
      ),
      borderRadius: radius(radiusValue),
      border: Border.all(
        color: Colors.white.withOpacity(AppColors.isDark ? 0.12 : 0.45),
      ),
      boxShadow: [
        ...raisedShadow(
          darkShadow: accent.withOpacity(0.16),
          blur: 24,
          darkOffset: const Offset(10, 10),
          lightOffset: const Offset(-8, -8),
        ),
      ],
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
  });
}

class AppThemeOptions {
  static const sunset = AppThemeOption(
    id: 'sunset',
    label: 'Sunset Orange',
    description: 'Warm orange and cream',
    primary: Color(0xFFFF8A1F),
    primaryDark: Color(0xFFE56F00),
    primaryLight: Color(0xFFFFB86B),
    primarySoft: Color(0xFFFFE6CC),
    background: Color(0xFFF8F2EB),
    backgroundSecondary: Color(0xFFF1E7DD),
    cardColor: Color(0xFFFFFCF8),
    accentTint: Color(0xFFFFD4AD),
  );

  static const ocean = AppThemeOption(
    id: 'ocean',
    label: 'Ocean Blue',
    description: 'Cool blue and mist',
    primary: Color(0xFF287DFF),
    primaryDark: Color(0xFF155AD1),
    primaryLight: Color(0xFF79B0FF),
    primarySoft: Color(0xFFD9E8FF),
    background: Color(0xFFF1F6FF),
    backgroundSecondary: Color(0xFFE4ECF8),
    cardColor: Color(0xFFFBFDFF),
    accentTint: Color(0xFFD7E8FF),
  );

  static const forest = AppThemeOption(
    id: 'forest',
    label: 'Forest Green',
    description: 'Fresh green and sage',
    primary: Color(0xFF2F9E68),
    primaryDark: Color(0xFF23784E),
    primaryLight: Color(0xFF7ED7AA),
    primarySoft: Color(0xFFD7F3E4),
    background: Color(0xFFF2F7F1),
    backgroundSecondary: Color(0xFFE3EEE0),
    cardColor: Color(0xFFFBFEFA),
    accentTint: Color(0xFFD7EEDB),
  );

  static const plum = AppThemeOption(
    id: 'plum',
    label: 'Plum Purple',
    description: 'Deep plum and lavender',
    primary: Color(0xFF8A56E8),
    primaryDark: Color(0xFF6C3FC0),
    primaryLight: Color(0xFFC29EFF),
    primarySoft: Color(0xFFE9DDFF),
    background: Color(0xFFF6F1FF),
    backgroundSecondary: Color(0xFFECE4F9),
    cardColor: Color(0xFFFEFBFF),
    accentTint: Color(0xFFE5D8FF),
  );

  static const ruby = AppThemeOption(
    id: 'ruby',
    label: 'Ruby Red',
    description: 'Bold ruby and blush',
    primary: Color(0xFFE0245E),
    primaryDark: Color(0xFFB31544),
    primaryLight: Color(0xFFF5729B),
    primarySoft: Color(0xFFFBE0E8),
    background: Color(0xFFFBF1F3),
    backgroundSecondary: Color(0xFFF5E3E7),
    cardColor: Color(0xFFFFFDFE),
    accentTint: Color(0xFFF6CFD9),
  );

  static const List<AppThemeOption> all = [
    sunset,
    ocean,
    forest,
    plum,
    ruby,
  ];

  static const AppThemeOption defaultOption = sunset;

  static AppThemeOption fromId(String id) {
    for (final option in all) {
      if (option.id == id) {
        return option;
      }
    }
    return defaultOption;
  }
}

class AppTheme {
  static ThemeData get lightTheme =>
      lightThemeFor(AppThemeOptions.defaultOption);

  static ThemeData lightThemeFor(AppThemeOption option) {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: option.primary,
      scaffoldBackgroundColor: option.background,
      colorScheme: ColorScheme.light(
        primary: option.primary,
        secondary: AppColors.secondary,
        surface: option.cardColor,
        background: option.background,
        error: AppColors.danger,
        onPrimary: AppColors.light,
        onSecondary: AppColors.light,
        onSurface: AppColors.dark,
        onBackground: AppColors.dark,
        onError: AppColors.light,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.dark,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(24),
        ),
        color: option.cardColor,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: option.primary,
          foregroundColor: AppColors.light,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(20),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
          shadowColor: Colors.transparent,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: option.primary,
          backgroundColor: option.cardColor,
          side: BorderSide(color: Colors.white.withOpacity(0.7), width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(20),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: option.primary,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: option.backgroundSecondary,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide(
            color: Colors.white.withOpacity(0.65),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide(color: option.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        labelStyle: TextStyle(color: AppColors.gray600),
        hintStyle: TextStyle(color: AppColors.gray400),
        prefixIconColor: AppColors.gray600,
        suffixIconColor: AppColors.gray500,
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 34,
          fontWeight: FontWeight.w800,
          color: AppColors.dark,
          letterSpacing: -0.5,
        ),
        displayMedium: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
          letterSpacing: -0.3,
        ),
        displaySmall: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
        ),
        headlineMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColors.gray800,
          fontWeight: FontWeight.w500,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.gray700,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColors.gray600,
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        selectedItemColor: option.primary,
        unselectedItemColor: AppColors.gray500,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: option.primary,
        foregroundColor: AppColors.light,
        elevation: 0,
      ),
      dividerTheme: DividerThemeData(
        color: option.backgroundSecondary,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: option.backgroundSecondary,
        selectedColor: option.primary.withOpacity(0.15),
        labelStyle: TextStyle(color: AppColors.gray700),
        secondaryLabelStyle: TextStyle(color: option.primary),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(18),
        ),
      ),
    );
  }

  static ThemeData get darkTheme => darkThemeFor(AppThemeOptions.defaultOption);

  static ThemeData darkThemeFor(AppThemeOption option) {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: option.primary,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: ColorScheme.dark(
        primary: option.primary,
        secondary: AppColors.secondary,
        surface: AppColors.gray100,
        background: AppColors.background,
        error: AppColors.danger,
        onPrimary: AppColors.light,
        onSecondary: AppColors.light,
        onSurface: AppColors.dark,
        onBackground: AppColors.dark,
        onError: AppColors.light,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.dark,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(24),
        ),
        color: AppColors.gray100,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: option.primary,
          foregroundColor: AppColors.light,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(20),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
          shadowColor: Colors.transparent,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: option.primary,
          backgroundColor: AppColors.gray100,
          side: BorderSide(color: Colors.white.withOpacity(0.12), width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: ClayStyles.radius(20),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: option.primary,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.backgroundSecondary,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide(
            color: Colors.white.withOpacity(0.08),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: BorderSide(color: option.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: ClayStyles.radius(20),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        labelStyle: TextStyle(color: AppColors.gray600),
        hintStyle: TextStyle(color: AppColors.gray400),
        prefixIconColor: AppColors.gray600,
        suffixIconColor: AppColors.gray500,
      ),
      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 34,
          fontWeight: FontWeight.w800,
          color: AppColors.dark,
          letterSpacing: -0.5,
        ),
        displayMedium: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
          letterSpacing: -0.3,
        ),
        displaySmall: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
        ),
        headlineMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColors.gray800,
          fontWeight: FontWeight.w500,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.gray700,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColors.gray600,
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        selectedItemColor: option.primary,
        unselectedItemColor: AppColors.gray500,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: option.primary,
        foregroundColor: AppColors.light,
        elevation: 0,
      ),
      dividerTheme: DividerThemeData(
        color: AppColors.backgroundSecondary,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.backgroundSecondary,
        selectedColor: option.primary.withOpacity(0.15),
        labelStyle: TextStyle(color: AppColors.gray700),
        secondaryLabelStyle: TextStyle(color: option.primary),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: ClayStyles.radius(18),
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

  static const double radiusSmall = 8.0;
  static const double radiusMedium = 16.0;
  static const double radiusLarge = 20.0;
  static const double radiusXLarge = 24.0;
  static const double radiusXXLarge = 32.0;

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
