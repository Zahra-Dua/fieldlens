import 'package:freezed_annotation/freezed_annotation.dart';

part 'auth_tokens.freezed.dart';
part 'auth_tokens.g.dart';

/// Access + refresh token pair returned by the API's login/refresh
/// endpoints.
@freezed
abstract class AuthTokens with _$AuthTokens {
  /// Creates a new token pair.
  const factory AuthTokens({
    required String accessToken,
    required String refreshToken,
  }) = _AuthTokens;

  /// Parses the JSON shape the API returns.
  factory AuthTokens.fromJson(Map<String, dynamic> json) =>
      _$AuthTokensFromJson(json);
}
