import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/data_provider.dart';
import 'utils/constants.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

final RouteObserver<PageRoute> routeObserver = RouteObserver<PageRoute>();

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MarioApp());
}

class MarioApp extends StatelessWidget {
  const MarioApp({super.key});

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
        navigatorObservers: [routeObserver],
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

    // If database is not connected, show connecting splash screen
    // if (!auth.isDbConnected) {
    //   return const SplashScreen(status: 'Connecting to Database...');
    // }

    // Database is connected! Check if authenticated
    if (auth.isAuthenticated) {
      final dataProvider = context.watch<DataProvider>();
      
      // If tables are already loaded, mark data as loaded
      if (dataProvider.tables.isNotEmpty) {
        _isDataLoaded = true;
      }

      if (!_isDataLoaded && !_isDataLoading) {
        _isDataLoading = true;
        WidgetsBinding.instance.addPostFrameCallback((_) async {
          try {
            await context.read<DataProvider>().loadAllData(auth);
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
        return const SplashScreen(status: 'Loading Restaurant Data...');
      }
      return const HomeScreen();
    }

    // If not authenticated, reset data load states and show login
    _isDataLoaded = false;
    _isDataLoading = false;
    return const LoginScreen();
  }
}