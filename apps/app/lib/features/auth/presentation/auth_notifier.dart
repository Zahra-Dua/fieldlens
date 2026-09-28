import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the user is signed in. Talks to the repository, never to a
/// concrete implementation.
class AuthNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  /// Signs in through the repository, then marks the user as signed in.
  Future<void> signIn() async {
    await ref.read(authRepositoryProvider).signIn();
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
