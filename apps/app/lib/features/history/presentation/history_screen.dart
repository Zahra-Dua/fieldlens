import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Watches the local inspections table live, so a row's sync status
/// updates on screen the moment the sync worker (Day 10) changes it.
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
      body: switch (inspections) {
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
    );
  }
}

class _InspectionTile extends StatelessWidget {
  const _InspectionTile(this.inspection);

  final Inspection inspection;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(inspection.capturedAt.toString()),
      subtitle: Text('Status: ${inspection.syncStatus}'),
      trailing: _StatusIcon(inspection.syncStatus),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon(this.status);

  final String status;

  @override
  Widget build(BuildContext context) {
    return switch (status) {
      InspectionSyncStatus.synced => const Icon(
        Icons.cloud_done,
        color: Colors.green,
      ),
      InspectionSyncStatus.syncing => const Icon(Icons.cloud_upload),
      InspectionSyncStatus.failed => const Icon(Icons.error, color: Colors.red),
      _ => const Icon(Icons.cloud_queue),
    };
  }
}
