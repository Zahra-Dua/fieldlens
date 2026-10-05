import 'dart:async';

import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/data/sync_worker.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_state.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class _ResumeObserver with WidgetsBindingObserver {
  _ResumeObserver(this.onResumed);

  final VoidCallback onResumed;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) onResumed();
  }
}

/// Decides when the sync worker runs. Only active while signed in.
class SyncController extends Notifier<SyncState> {
  static const _minRetryGap = Duration(seconds: 1);

  // The network interface can come up before the network works, so the
  // first attempt after a reconnect waits a moment.
  static const _settleDelay = Duration(seconds: 2);

  // A safety net for a missed connectivity event.
  static const _heartbeat = Duration(seconds: 30);

  Timer? _retryTimer;
  Timer? _heartbeatTimer;
  bool _active = false;

  @override
  SyncState build() {
    _active = false;
    if (!ref.watch(authProvider)) return const SyncState();
    _active = true;

    final observer = _ResumeObserver(() => unawaited(_syncQuietly()));
    WidgetsBinding.instance.addObserver(observer);
    final connectivitySub = ref
        .read(connectivityGatewayProvider)
        .onlineChanges
        .listen((online) {
          if (online) unawaited(_syncAfterSettling());
        });
    _heartbeatTimer = Timer.periodic(
      _heartbeat,
      (_) => unawaited(_syncQuietly()),
    );
    ref.onDispose(() {
      _active = false;
      WidgetsBinding.instance.removeObserver(observer);
      unawaited(connectivitySub.cancel());
      _retryTimer?.cancel();
      _heartbeatTimer?.cancel();
    });

    unawaited(_start(ref.read(inspectionDaoProvider)));
    return const SyncState();
  }

  Future<void> _start(InspectionDao dao) async {
    final stored = await dao.readMeta(SyncMetaKeys.lastPushAt);
    if (!_active) return;
    if (stored != null) {
      state = state.copyWith(lastSyncedAt: DateTime.tryParse(stored));
    }
    await _syncQuietly();
  }

  /// The user asked for a sync: waiting entries are retried right away,
  /// even if they were backed off after a failure.
  Future<void> syncNow() => _run(manual: true);

  // Automatic triggers respect the backoff, so a struggling server is not
  // hammered.
  Future<void> _syncQuietly() => _run(manual: false);

  Future<void> _syncAfterSettling() async {
    await Future<void>.delayed(_settleDelay);
    await _syncQuietly();
  }

  Future<void> _run({required bool manual}) async {
    if (!_active) return;
    final dao = ref.read(inspectionDaoProvider);
    final worker = ref.read(syncWorkerProvider);

    if (manual) {
      await dao.clearBackoff();
      if (!_active) return;
      state = state.copyWith(syncing: true);
    }
    final report = await worker.syncNow();

    // "Last synced" only moves when nothing is left waiting to retry, and
    // an automatic check only counts when it actually sent something.
    final clean =
        !report.offline && !report.sessionExpired && report.deferred == 0;
    final syncedAt = clean && (manual || report.synced > 0)
        ? DateTime.now()
        : null;
    if (syncedAt != null) {
      await dao.writeMeta(SyncMetaKeys.lastPushAt, syncedAt.toIso8601String());
    }
    if (!_active) return;
    state = state.copyWith(
      syncing: false,
      lastReport: report,
      lastSyncedAt: syncedAt ?? state.lastSyncedAt,
    );
    await _scheduleRetry(dao, report);
  }

  Future<void> _scheduleRetry(InspectionDao dao, SyncReport report) async {
    _retryTimer?.cancel();
    // Offline waits for the reconnect trigger, and an expired session
    // waits for a new login, so a timer would only spin.
    if (report.offline || report.sessionExpired) return;
    final next = await dao.earliestRetryAt();
    if (next == null || !_active) return;
    final wait = next.difference(DateTime.now());
    _retryTimer = Timer(
      wait.isNegative ? _minRetryGap : wait + _minRetryGap,
      () => unawaited(_syncQuietly()),
    );
  }
}

/// Exposes the sync state and the manual "Sync now" action.
final syncControllerProvider = NotifierProvider<SyncController, SyncState>(
  SyncController.new,
);
