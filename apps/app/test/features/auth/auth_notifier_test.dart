import 'package:fieldlens_app/core/network/token_storage.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingAuthRepository implements AuthRepository {
  int signInCalls = 0;
  int signOutCalls = 0;

  @override
  Future<void> signIn(String email, String password) async => signInCalls++;

  @override
  Future<void> signOut() async => signOutCalls++;
}

// Avoids the real secure-storage platform channel, which isn't available
// in a unit test. Starts with no token, so build() doesn't auto-restore.
class _FakeTokenStorage implements TokenStorage {
  String? accessToken;
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

ProviderContainer _containerWith(AuthRepository repo) {
  final container = ProviderContainer(
    overrides: [
      authRepositoryProvider.overrideWithValue(repo),
      tokenStorageProvider.overrideWithValue(_FakeTokenStorage()),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  test('signIn goes through the repository and flips auth state', () async {
    final repo = _RecordingAuthRepository();
    final container = _containerWith(repo);

    expect(container.read(authProvider), isFalse);

    await container
        .read(authProvider.notifier)
        .signIn('test@example.com', 'password');

    expect(container.read(authProvider), isTrue);
    expect(repo.signInCalls, 1);
  });

  test('signOut goes through the repository and clears auth state', () async {
    final repo = _RecordingAuthRepository();
    final container = _containerWith(repo);

    await container
        .read(authProvider.notifier)
        .signIn('test@example.com', 'password');
    await container.read(authProvider.notifier).signOut();

    expect(container.read(authProvider), isFalse);
    expect(repo.signOutCalls, 1);
  });
}
