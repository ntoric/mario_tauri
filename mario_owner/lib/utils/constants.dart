import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppConstants {
  static const String appName = 'Mario Business';
  static const String appVersion = '1.0.0';
  static const String defaultApiUrl = 'https://mario-v2-backend.ntoric.com';
}

class AppColors {
  // Primary palette — vibrant violet (finance app)
  static const Color primary = Color(0xFF7B6EF6);
  static const Color primaryDark = Color(0xFF6A5AE0);
  static const Color primaryLight = Color(0xFFB4A9FF);
  static const Color primaryExtraLight = Color(0xFFF0EDFF);

  // Accent
  static const Color accent = Color(0xFF00CEC9);
  static const Color accentDark = Color(0xFF00B5B0);

  // Dark card colors (finance app style)
  static const Color cardDark = Color(0xFF1E1438);
  static const Color cardDarkLight = Color(0xFF2D1B5E);

  // Neutrals
  static const Color dark = Color(0xFF1E1438);
  static const Color darker = Color(0xFF0F0A1F);
  static const Color secondary = Color(0xFF2D3748);
  static const Color light = Color(0xFFFFFFFF);

  // Background
  static const Color background = Color(0xFFF8F9FE);

  // Grays
  static const Color gray50 = Color(0xFFF8F9FE);
  static const Color gray100 = Color(0xFFF1F3FE);
  static const Color gray200 = Color(0xFFE8EAF6);
  static const Color gray300 = Color(0xFFD8DBE8);
  static const Color gray400 = Color(0xFFB8BCCE);
  static const Color gray500 = Color(0xFF8E92A6);
  static const Color gray600 = Color(0xFF6B6F85);
  static const Color gray700 = Color(0xFF4A4E63);
  static const Color gray800 = Color(0xFF2D3047);

  // Semantic
  static const Color success = Color(0xFF00B894);
  static const Color successLight = Color(0xFF55EFC4);
  static const Color warning = Color(0xFFFDCB6E);
  static const Color warningDark = Color(0xFFE17055);
  static const Color danger = Color(0xFFE84393);
  static const Color dangerLight = Color(0xFFFAB1C7);
  static const Color info = Color(0xFF0984E3);
  static const Color infoLight = Color(0xFF74B9FF);

  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7B6EF6), Color(0xFF9D8FFF)],
  );

  static const LinearGradient darkGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1E1438), Color(0xFF2D1B5E)],
  );

  static const LinearGradient successGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF00B894), Color(0xFF55EFC4)],
  );

  static const LinearGradient dangerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFE84393), Color(0xFFFAB1C7)],
  );

  static const LinearGradient warningGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFE17055), Color(0xFFFDCB6E)],
  );

  static const LinearGradient infoGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0984E3), Color(0xFF74B9FF)],
  );

  static const LinearGradient accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF00CEC9), Color(0xFF55EFC4)],
  );

  // Shadows
  static List<BoxShadow> softShadow([
    Color color = const Color(0xFF7B6EF6),
    double opacity = 0.08,
  ]) {
    return [
      BoxShadow(
        color: color.withValues(alpha: opacity),
        blurRadius: 20,
        offset: const Offset(0, 8),
      ),
    ];
  }

  static List<BoxShadow> cardShadow = [
    BoxShadow(
      color: const Color(0xFF1E1438).withValues(alpha: 0.05),
      blurRadius: 16,
      offset: const Offset(0, 2),
    ),
  ];

  static List<BoxShadow> elevatedShadow = [
    BoxShadow(
      color: const Color(0xFF1E1438).withValues(alpha: 0.08),
      blurRadius: 24,
      offset: const Offset(0, 4),
    ),
  ];
}

class AppAnimations {
  static const Duration fast = Duration(milliseconds: 200);
  static const Duration medium = Duration(milliseconds: 350);
  static const Duration slow = Duration(milliseconds: 500);
  static const Duration slower = Duration(milliseconds: 800);

  static const Curve defaultCurve = Curves.easeOutCubic;
  static const Curve entryCurve = Curves.easeOutBack;
  static const Curve exitCurve = Curves.easeInCubic;
  static const Curve bounceCurve = Curves.elasticOut;
}

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.light,
        error: AppColors.danger,
        onPrimary: AppColors.light,
        onSecondary: AppColors.light,
        onSurface: AppColors.dark,
        onError: AppColors.light,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: AppColors.dark,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        color: AppColors.light,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.light,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.3,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.gray100,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        labelStyle: const TextStyle(color: AppColors.gray600, fontWeight: FontWeight.w500),
        hintStyle: const TextStyle(color: AppColors.gray400),
        prefixIconColor: AppColors.gray500,
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
          fontWeight: FontWeight.w800,
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
        titleLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: AppColors.dark,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColors.gray800,
          fontWeight: FontWeight.w400,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.gray700,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColors.gray600,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.gray500,
          letterSpacing: 0.5,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.light,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.gray500,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.light,
        elevation: 4,
        shape: CircleBorder(),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.gray200,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.gray100,
        selectedColor: AppColors.primaryExtraLight,
        labelStyle: const TextStyle(color: AppColors.gray700, fontWeight: FontWeight.w500),
        secondaryLabelStyle: const TextStyle(color: AppColors.primary),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.light,
        indicatorColor: AppColors.primaryExtraLight,
        labelTextStyle: WidgetStateProperty.all(
          const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        ),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.primary, size: 26);
          }
          return const IconThemeData(color: AppColors.gray400, size: 24);
        }),
      ),
      listTileTheme: const ListTileThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(14)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.dark,
        contentTextStyle: const TextStyle(color: AppColors.light, fontSize: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.darker,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        secondary: AppColors.accent,
        surface: AppColors.dark,
        error: AppColors.danger,
        onPrimary: AppColors.light,
        onSecondary: AppColors.light,
        onSurface: AppColors.light,
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
  static const double radiusMedium = 14.0;
  static const double radiusLarge = 20.0;
  static const double radiusXLarge = 28.0;
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
