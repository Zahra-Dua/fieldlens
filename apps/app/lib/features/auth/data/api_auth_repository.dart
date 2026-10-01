import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/core/network/token_storage.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:fieldlens_app/features/auth/domain/auth_tokens.dart';
import 'package:fieldlens_app/features/auth/domain/user.dart';

/// [AuthRepository] backed by the real FieldLens API.
class ApiAuthRepository implements AuthRepository {
  /// Creates a new repository that uses [_client] to talk to the API.
  ApiAuthRepository(this._client);

  final ApiClient _client;

  TokenStorage get _tokenStorage => _client.tokenStorage;

  /// Signs the user in with [email] and [password], storing the returned
  /// tokens in secure storage.
  @override
  Future<void> signIn(String email, String password) async {
    try {
      final response = await _client.dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      final tokens = AuthTokens.fromJson(response.data!);
      await _tokenStorage.save(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
    } on DioException catch (error) {
      // On the login route a 401 means bad credentials, not an expired
      // session, so the user needs a different message.
      if (error.response?.statusCode == 401) {
        throw const InvalidCredentialsException();
      }
      throw ApiClient.mapError(error);
    } catch (error) {
      throw ApiClient.mapError(error);
    }
  }

  @override
  Future<void> signOut() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _client.dio.post<void>(
          '/auth/logout',
          data: {'refreshToken': refreshToken},
        );
      } on Exception catch (_) {
        // Best-effort revoke. Local tokens are cleared regardless, so the
        // user is logged out on this device even if the server call fails.
      }
    }
    await _tokenStorage.clear();
  }

  /// Fetches the current user. Throws [SessionExpiredException] if no
  /// token is stored or the server rejects it.
  Future<User> fetchCurrentUser() async {
    try {
      final response = await _client.dio.get<Map<String, dynamic>>('/auth/me');
      return User.fromJson(response.data!);
    } catch (error) {
      throw ApiClient.mapError(error);
    }
  }
}
