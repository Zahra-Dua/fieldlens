/// Build-time configuration, injected with `--dart-define`.
class AppConfig {
  /// Creates an [AppConfig].
  const new({required this.apiBaseUrl});

  /// Reads values passed with `--dart-define`.
  factory fromEnvironment() => const AppConfig(
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      // Android emulator's alias for the host machine's localhost.
      defaultValue: 'http://10.0.2.2:3000',
    ),
  );

  /// Base URL of the FieldLens API.
  final String apiBaseUrl;
}
