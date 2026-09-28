/// What the app needs from authentication, independent of how it is done.
abstract interface class AuthRepository {
  /// Signs the user in.
  Future<void> signIn();

  /// Signs the user out.
  Future<void> signOut();
}
