import 'dart:async';

import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Placeholder login screen.
class LoginScreen extends ConsumerWidget {
  /// Creates a [LoginScreen].
  const new({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Center(
        child: FilledButton(
          onPressed: () => unawaited(ref.read(authProvider.notifier).signIn()),
          child: const Text('Sign in (placeholder)'),
        ),
      ),
    );
  }
}
