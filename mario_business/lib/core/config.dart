/// App-wide constants.
class AppConfig {
  AppConfig._();

  static const appName = 'Mario Business';

  /// Backend server. Users can't change it in the app; developers can point
  /// a local build elsewhere with `--dart-define=API_URL=https://host/api`.
  static const defaultApiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://mario-api.ntoric.com/api',
  );

  /// How long a fetched report stays fresh in the in-memory cache before a
  /// screen revisit triggers a refetch. Pull-to-refresh always bypasses it.
  static const cacheTtl = Duration(minutes: 2);

  static const requestTimeout = Duration(seconds: 45);

  /// Only this role may use the app.
  static const ownerRole = 'business_owner';
}
