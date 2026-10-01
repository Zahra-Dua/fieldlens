import 'dart:async';

import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the user is signed in. Talks to the repository, never to a
/// concrete implementation.
class AuthNotifier extends Notifier<bool> {
  @override
  bool build() {
    // Synchronous build can't await, so kick off the real check and let it
    // update state once it resolves. Starts false (shows the login guard
    // briefly) and flips to true if a stored token is found.
    unawaited(_restoreSession());
    return false;
  }

  Future<void> _restoreSession() async {
    final token = await ref.read(tokenStorageProvider).readAccessToken();
    if (token != null) state = true;
  }

  /// Called by ApiClient after a rejected refresh; tokens are already gone.
  void handleSessionExpired() => state = false;

  /// Signs in through the repository, then marks the user as signed in.
  /// Throws a [NetworkException] on failure — the caller shows it.
  Future<void> signIn(String email, String password) async {
    await ref.read(authRepositoryProvider).signIn(email, password);
    state = true;
  }

  /// Signs out through the repository, then marks the user as signed out.
  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    state = false;
  }
}

/// Exposes the current sign-in state.
final authProvider = NotifierProvider<AuthNotifier, bool>(AuthNotifier.new);
