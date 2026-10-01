import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

/// The signed-in user, as returned by GET /auth/me.
@freezed
abstract class User with _$User {
  /// Creates a new user instance.
  const factory User({
    required String id,
    required String name,
    required String email,
    required String role,
  }) = _User;

  /// Parses the JSON shape the API returns.
  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
