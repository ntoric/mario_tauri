import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppConstants {
  static const String appName = 'Mario App';
  static const String appVersion = '1.0.0';

  static const String defaultApiUrl = 'https://mario-v2-backend.ntoric.com';
}

class AppColors {
  static const Color primary = Color(0xFFFF8A1F);
  static const Color primaryDark = Color(0xFFE56F00);
  static const Color primaryLight = Color(0xFFFFB86B);
  static const Color primarySoft = Color(0xFFFFE6CC);
  static const Color secondary = Color(0xFF1E1A17);
  static const Color dark = Color(0xFF151515);
  static const Color darker = Color(0xFF090909);
  static const Color light = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFF8F2EB);
  static const Color backgroundSecondary = Color(0xFFF1E7DD);
  static const Color gray100 = Color(0xFFFFFCF8);
  static const Color gray200 = Color(0xFFF5ECE2);
  static const Color gray300 = Color(0xFFE7D8C8);
  static const Color gray400 = Color(0xFFD0C0B0);
  static const Color gray500 = Color(0xFFA89584);
  static const Color gray600 = Color(0xFF7A6859);
  static const Color gray700 = Color(0xFF4F433A);
  static const Color gray800 = Color(0xFF2B2622);
  static const Color clayPink = Color(0xFFFFE1D1);
  static const Color clayBlue = Color(0xFFFFF0E1);
  static const Color clayPeach = Color(0xFFFFD4AD);
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
    Color darkShadow = const Color(0x1F9B7A5B),
    Color lightShadow = const Color(0xCCFFFFFF),
    double blur = 26,
    Offset darkOffset = const Offset(14, 14),
    Offset lightOffset = const Offset(-10, -10),
  }) {
    return [
      BoxShadow(
        color: darkShadow,
        blurRadius: blur,
        offset: darkOffset,
      ),
      BoxShadow(
        color: lightShadow,
        blurRadius: blur,
        offset: lightOffset,
      ),
    ];
  }

  static LinearGradient surfaceGradient({
    Color top = const Color(0xFFFFFDFC),
    Color bottom = const Color(0xFFF1E5D8),
  }) {
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [top, bottom],
    );
  }

  static LinearGradient insetGradient({
    Color top = const Color(0xFFF0E4D7),
    Color bottom = const Color(0xFFFFFCF8),
  }) {
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [top, bottom],
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
            color: Colors.white.withOpacity(0.65),
            width: 1,
          ),
      boxShadow: [
        BoxShadow(
          color: Colors.white.withOpacity(0.75),
          blurRadius: 16,
          offset: const Offset(-6, -6),
        ),
        BoxShadow(
          color: AppColors.gray500.withOpacity(0.10),
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
        color: Colors.white.withOpacity(0.45),
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

  static const List<AppThemeOption> all = [
    sunset,
    ocean,
    forest,
    plum,
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
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.dark,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
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
        labelStyle: const TextStyle(color: AppColors.gray600),
        hintStyle: const TextStyle(color: AppColors.gray400),
        prefixIconColor: AppColors.gray600,
        suffixIconColor: AppColors.gray500,
      ),
      textTheme: const TextTheme(
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
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.transparent,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.gray500,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: option.primary,
        foregroundColor: AppColors.light,
        elevation: 0,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.gray200,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: option.backgroundSecondary,
        selectedColor: option.primary.withOpacity(0.15),
        labelStyle: const TextStyle(color: AppColors.gray700),
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
      scaffoldBackgroundColor: AppColors.darker,
      colorScheme: ColorScheme.dark(
        primary: option.primary,
        secondary: AppColors.secondary,
        surface: AppColors.dark,
        background: AppColors.darker,
        error: AppColors.danger,
        onPrimary: AppColors.light,
        onSecondary: AppColors.light,
        onSurface: AppColors.light,
        onBackground: AppColors.light,
        onError: AppColors.light,
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
