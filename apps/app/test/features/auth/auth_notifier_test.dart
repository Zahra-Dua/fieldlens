import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingAuthRepository implements AuthRepository {
  int signInCalls = 0;
  int signOutCalls = 0;

  @override
  Future<void> signIn() async => signInCalls++;

  @override
  Future<void> signOut() async => signOutCalls++;
}

void main() {
  test('signIn goes through the repository and flips auth state', () async {
    final repo = _RecordingAuthRepository();
    final container = ProviderContainer(
      overrides: [authRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);

    expect(container.read(authProvider), isFalse);

    await container.read(authProvider.notifier).signIn();

    expect(container.read(authProvider), isTrue);
    expect(repo.signInCalls, 1);
  });

  test('signOut goes through the repository and clears auth state', () async {
    final repo = _RecordingAuthRepository();
    final container = ProviderContainer(
      overrides: [authRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);

    await container.read(authProvider.notifier).signIn();
    await container.read(authProvider.notifier).signOut();

    expect(container.read(authProvider), isFalse);
    expect(repo.signOutCalls, 1);
  });
}
