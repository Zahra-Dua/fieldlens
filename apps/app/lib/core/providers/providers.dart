import 'package:fieldlens_app/core/providers/app_config.dart';
import 'package:fieldlens_app/features/auth/data/fake_auth_repository.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Build-time configuration.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// The auth repository. Swap the implementation here, or override it in tests.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => FakeAuthRepository(),
);
