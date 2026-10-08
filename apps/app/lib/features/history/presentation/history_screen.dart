import 'dart:async';

import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_status_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Watches the local inspections table live, so a row's sync status
/// updates on screen the moment the sync worker changes it.
/// This is a private provider because the screen itself is the only consumer.
final StreamProvider<List<Inspection>> _inspectionsStreamProvider =
    StreamProvider.autoDispose<List<Inspection>>((ref) {
      return ref.watch(inspectionDaoProvider).watchAll();
    });

/// Local inspection history, read straight from the on-device database.
class HistoryScreen extends ConsumerWidget {
  /// Creates a [HistoryScreen].
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inspections = ref.watch(_inspectionsStreamProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('History'),
        leading: BackButton(onPressed: () => context.go(AppRoutes.capture)),
      ),
      body: Column(
        children: [
          const SyncStatusBar(),
          Expanded(
            child: switch (inspections) {
              AsyncData(:final value) when value.isEmpty => const Center(
                child: Text('No inspections yet'),
              ),
              AsyncData(:final value) => ListView.builder(
                itemCount: value.length,
                itemBuilder: (context, index) => _InspectionTile(value[index]),
              ),
              AsyncError(:final error) => Center(child: Text('Error: $error')),
              _ => const Center(child: CircularProgressIndicator()),
            },
          ),
        ],
      ),
    );
  }
}

class _InspectionTile extends ConsumerWidget {
  const _InspectionTile(this.inspection);

  final Inspection inspection;

  // A rejected inspection is not retried automatically, so the user asks.
  Future<void> _retry(WidgetRef ref) async {
    await ref.read(inspectionDaoProvider).retryFailed(inspection.id);
    unawaited(ref.read(syncControllerProvider.notifier).syncNow());
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final failed = inspection.syncStatus == InspectionSyncStatus.failed;
    final prediction = inspection.predictedClass;
    final confidence = inspection.confidence;
    final classificationSummary = prediction == null
        ? 'Not classified'
        : '${inspection.correctedClass ?? prediction} · '
              '${((confidence ?? 0) * 100).toStringAsFixed(1)}%'
              '${inspection.isUncertain == true ? ' · Uncertain' : ''}';
    return ListTile(
      leading: _StatusIcon(inspection.syncStatus),
      title: Text(inspection.capturedAt.toString()),
      subtitle: Text(
        '$classificationSummary\nStatus: ${inspection.syncStatus}',
      ),
      isThreeLine: true,
      trailing: failed
          ? TextButton(
              onPressed: () => unawaited(_retry(ref)),
              child: const Text('Retry'),
            )
          : null,
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon(this.status);

  final String status;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return switch (status) {
      InspectionSyncStatus.synced => Icon(
        Icons.cloud_done,
        color: colors.primary,
      ),
      InspectionSyncStatus.syncing => const Icon(Icons.cloud_upload),
      InspectionSyncStatus.failed => Icon(Icons.error, color: colors.error),
      _ => const Icon(Icons.cloud_queue),
    };
  }
}
