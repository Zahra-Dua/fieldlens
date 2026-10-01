import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';

/// In-memory stand-in, used only in tests now that ApiAuthRepository exists.
class FakeAuthRepository implements AuthRepository {
  @override
  Future<void> signIn(String email, String password) async {}

  @override
  Future<void> signOut() async {}
}
