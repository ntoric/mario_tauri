import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/config.dart';
import 'data/owner_repository.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/splash_screen.dart';
import 'features/shell/home_shell.dart';
import 'state/session.dart';
import 'theme/app_theme.dart';
import 'theme/theme_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Fall back to the platform font instead of erroring when offline.
  GoogleFonts.config.allowRuntimeFetching = true;
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]);

  final prefs = await SharedPreferences.getInstance();
  final repo = OwnerRepository(ApiClient());

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeController(prefs)),
        ChangeNotifierProvider(create: (_) => Session(prefs, repo)..restore()),
        Provider.value(value: repo),
      ],
      child: const MarioBusinessApp(),
    ),
  );
}

class MarioBusinessApp extends StatelessWidget {
  const MarioBusinessApp({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeController>();
    final status = context.select<Session, AuthStatus>((s) => s.status);
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      themeMode: theme.mode,
      theme: AppTheme.build(theme.accent, Brightness.light),
      darkTheme: AppTheme.build(theme.accent, Brightness.dark, trueBlack: theme.trueBlack),
      home: AnimatedSwitcher(
        duration: const Duration(milliseconds: 350),
        child: switch (status) {
          AuthStatus.signedIn => const HomeShell(key: ValueKey('home')),
          AuthStatus.restoring || AuthStatus.offline => const SplashScreen(key: ValueKey('splash')),
          AuthStatus.signedOut || AuthStatus.signingIn => const LoginScreen(key: ValueKey('login')),
        },
      ),
    );
  }
}
