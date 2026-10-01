import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Reads and writes the access/refresh token pair. Never SharedPreferences
/// — tokens are secrets and belong in the platform keystore.
class TokenStorage {
  /// Creates the storage, with the default secure storage backend.
  const TokenStorage([this._storage = const FlutterSecureStorage()]);

  final FlutterSecureStorage _storage;

  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';

  /// Saves both tokens.
  Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _accessKey, value: accessToken);
    await _storage.write(key: _refreshKey, value: refreshToken);
  }

  /// Reads the stored access token, if any.
  Future<String?> readAccessToken() => _storage.read(key: _accessKey);

  /// Reads the stored refresh token, if any.
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  /// Removes both tokens (logout).
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}
