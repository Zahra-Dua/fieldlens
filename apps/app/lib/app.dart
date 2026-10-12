import 'dart:async';

import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_router.dart';
import 'package:fieldlens_app/core/theme/app_theme.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/classify/data/tflite_classifier.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Root widget of the FieldLens app.
class FieldLensApp extends ConsumerWidget {
  /// Creates the app.
  const FieldLensApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<bool>(authProvider, (previous, isAuthenticated) {
      if (isAuthenticated) {
        unawaited(_checkForModelUpdate(ref));
      }
    });

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

  Future<void> _checkForModelUpdate(WidgetRef ref) async {
    try {
      final updater = await ref.read(modelUpdateServiceProvider.future);
      await updater.checkAndUpdate(TfliteClassifier.bundledModelVersion);
      ref.invalidate(activeModelVersionProvider);
    } on Object catch (error, stackTrace) {
      debugPrint(
        'Model update check failed; keeping the current model: $error',
      );
      debugPrintStack(stackTrace: stackTrace);
    }
  }
}
