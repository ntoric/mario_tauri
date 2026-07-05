import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/data_provider.dart';
import 'utils/constants.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MarioOwnerApp());
}

class MarioOwnerApp extends StatelessWidget {
  const MarioOwnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => DataProvider()),
      ],
      child: MaterialApp(
        title: AppConstants.appName,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.light,
        home: const AppInitializer(),
      ),
    );
  }
}

class AppInitializer extends StatefulWidget {
  const AppInitializer({super.key});

  @override
  State<AppInitializer> createState() => _AppInitializerState();
}

class _AppInitializerState extends State<AppInitializer> {
  bool _isInitStarted = false;
  bool _isDataLoaded = false;
  bool _isDataLoading = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInitStarted) {
      _isInitStarted = true;
      _initializeApp();
    }
  }

  Future<void> _initializeApp() async {
    final auth = context.read<AuthProvider>();
    await auth.initialize();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    if (auth.isAuthenticated) {
      final dataProvider = context.watch<DataProvider>();

      if (dataProvider.orders.isNotEmpty || dataProvider.bills.isNotEmpty) {
        _isDataLoaded = true;
      }

      if (!_isDataLoaded && !_isDataLoading) {
        _isDataLoading = true;
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          try {
            if (auth.currentStore != null) {
              await context.read<DataProvider>().loadStoreData(auth.currentStore!.id);
            }
            if (mounted) {
              setState(() {
                _isDataLoaded = true;
                _isDataLoading = false;
              });
            }
          } catch (e) {
            if (mounted) {
              setState(() {
                _isDataLoading = false;
              });
            }
          }
        });
      }

      if (!_isDataLoaded) {
        return const SplashScreen(status: 'Loading Store Data...');
      }
      return const HomeScreen();
    }

    _isDataLoaded = false;
    _isDataLoading = false;
    return const LoginScreen();
  }
}
