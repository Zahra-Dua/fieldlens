import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';

/// In-memory stand-in until the real API repository arrives on Day 9.
class FakeAuthRepository implements AuthRepository {
  @override
  Future<void> signIn() async {}

  @override
  Future<void> signOut() async {}
}
