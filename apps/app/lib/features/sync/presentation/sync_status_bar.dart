import 'dart:async';

import 'package:fieldlens_app/features/sync/data/sync_worker.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shows when the last sync happened and lets the user start one.
class SyncStatusBar extends ConsumerWidget {
  /// Creates the bar.
  const SyncStatusBar({super.key});

  static String _formatTime(BuildContext context, DateTime time) {
    final localizations = MaterialLocalizations.of(context);
    return localizations.formatTimeOfDay(TimeOfDay.fromDateTime(time));
  }

  static String? _noteFor(SyncReport? report) {
    if (report == null) return null;
    if (report.offline) return 'Offline. Will sync when connected.';
    if (report.sessionExpired) return 'Please log in again to sync.';
    if (report.deferred > 0) return 'Server unavailable. Retrying soon.';
    if (report.failed > 0) return '${report.failed} could not be sent.';
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(syncControllerProvider);
    final last = sync.lastSyncedAt;
    final lastLabel = last == null
        ? 'Not synced yet'
        : 'Last synced ${_formatTime(context, last)}';
    final note = _noteFor(sync.lastReport);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(lastLabel),
                if (note != null)
                  Text(note, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          FilledButton.tonalIcon(
            onPressed: sync.syncing
                ? null
                : () => unawaited(
                    ref.read(syncControllerProvider.notifier).syncNow(),
                  ),
            icon: sync.syncing
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            label: const Text('Sync now'),
          ),
        ],
      ),
    );
  }
}
