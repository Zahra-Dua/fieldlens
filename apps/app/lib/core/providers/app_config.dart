/// Build-time configuration, supplied through --dart-define.
class AppConfig {
  /// Creates a configuration with the given [apiBaseUrl].
  const AppConfig({required this.apiBaseUrl});

  /// Reads the values passed with --dart-define. Fails loudly when the
  /// base URL is missing, instead of guessing a host.
  factory AppConfig.fromEnvironment() {
    const url = String.fromEnvironment('API_BASE_URL');
    if (url.isEmpty) {
      throw StateError(
        'API_BASE_URL is not set. Run with '
        '--dart-define-from-file=env/dev.json',
      );
    }
    return const AppConfig(apiBaseUrl: url);
  }

  /// Base URL of the FieldLens API.
  final String apiBaseUrl;
}
