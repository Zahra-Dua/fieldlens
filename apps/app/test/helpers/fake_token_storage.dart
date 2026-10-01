import 'package:fieldlens_app/core/network/token_storage.dart';

/// In-memory [TokenStorage] for tests, so the secure-storage platform
/// channel (unavailable in unit tests) is never touched.
class FakeTokenStorage implements TokenStorage {
  /// The stored access token, if any.
  String? accessToken;

  /// The stored refresh token, if any.
  String? refreshToken;

  @override
  Future<void> save({
    required String accessToken,
    required String refreshToken,
  }) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> clear() async {
    accessToken = null;
    refreshToken = null;
  }
}
