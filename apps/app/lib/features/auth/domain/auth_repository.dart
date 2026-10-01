/// What the app needs from authentication, independent of how it is done.
abstract interface class AuthRepository {
  /// Signs the user in with [email] and [password].
  Future<void> signIn(String email, String password);

  /// Signs the user out.
  Future<void> signOut();
}
