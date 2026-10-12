import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Shows app settings, including the active on-device model version.
class SettingsScreen extends ConsumerWidget {
  /// Creates the settings screen.
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to Capture',
          onPressed: () => context.go(AppRoutes.capture),
        ),
      ),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.memory),
            title: const Text('Active model version'),
            subtitle: ref
                .watch(activeModelVersionProvider)
                .when(
                  data: Text.new,
                  loading: () => const Text('Loading model version...'),
                  error: (error, _) =>
                      Text('Could not load model version: $error'),
                ),
          ),
        ],
      ),
    );
  }
}
