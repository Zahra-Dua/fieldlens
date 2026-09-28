import 'dart:async';

import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Placeholder capture screen. The camera arrives on Day 7.
class CaptureScreen extends ConsumerWidget {
  /// Creates a [CaptureScreen].
  const new({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Capture'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => context.go(AppRoutes.history),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () =>
                unawaited(ref.read(authProvider.notifier).signOut()),
          ),
        ],
      ),
      body: const Center(child: Text('Camera comes on Day 7')),
    );
  }
}
