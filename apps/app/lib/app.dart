import 'package:fieldlens_app/core/router/app_router.dart';
import 'package:fieldlens_app/core/theme/app_theme.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Root widget of the FieldLens app.
class FieldLensApp extends ConsumerWidget {
  /// Creates the app.
  const FieldLensApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Keeps the sync controller alive for as long as the app runs.
    ref.read(syncControllerProvider);
    return MaterialApp.router(
      title: 'FieldLens',
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: ref.watch(routerProvider),
      debugShowCheckedModeBanner: false,
    );
  }
}
