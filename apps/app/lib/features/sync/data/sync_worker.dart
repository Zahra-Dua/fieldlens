import 'dart:math';

import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/data/device_identity.dart';
import 'package:fieldlens_app/features/sync/domain/backoff.dart';
import 'package:fieldlens_app/features/sync/domain/connectivity_gateway.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';

/// What one sync run did.
class SyncReport {
  /// Creates a report.
  const SyncReport({
    this.synced = 0,
    this.failed = 0,
    this.deferred = 0,
    this.offline = false,
    this.sessionExpired = false,
  });

  /// Inspections the server now has.
  final int synced;

  /// Inspections rejected for good, waiting for a manual retry.
  final int failed;

  /// Inspections put back in the queue to be retried later.
  final int deferred;

  /// The run did nothing because there was no network.
  final bool offline;

  /// The run stopped because the login is no longer valid.
  final bool sessionExpired;
}

enum _Outcome { temporary, permanent, sessionExpired }

_Outcome _classify(NetworkException error) => switch (error) {
  SessionExpiredException() ||
  InvalidCredentialsException() => _Outcome.sessionExpired,
  ApiRejectedException() => _Outcome.permanent,
  NoConnectionException() ||
  ServerUnavailableException() ||
  UnknownNetworkException() => _Outcome.temporary,
};

class _Tally {
  int synced = 0;
  int failed = 0;
  int deferred = 0;
  bool stop = false;
  bool sessionExpired = false;
}

/// Drains the outbox to the server in batches. Retries are safe because
/// the server upserts on the client-generated id.
class SyncWorker {
  /// Creates the worker. [now] and [random] exist so tests can control
  /// time and jitter.
  SyncWorker({
    required this.dao,
    required this.remote,
    required this.identity,
    required this.connectivity,
    DateTime Function()? now,
    Random? random,
    this.batchSize = 20,
  }) : _now = now ?? DateTime.now,
       _random = random ?? Random();

  /// The local queue.
  final InspectionDao dao;

  /// The server.
  final SyncRemote remote;

  /// Supplies the server's id for this device.
  final DeviceIdentity identity;

  /// Tells whether there is a network at all.
  final ConnectivityGateway connectivity;

  /// How many inspections are sent in one request.
  final int batchSize;

  final DateTime Function() _now;
  final Random _random;

  Future<SyncReport>? _running;

  /// Runs a sync. If one is already running, returns that same run, so two
  /// triggers can never send the same rows twice at once.
  Future<SyncReport> syncNow() {
    return _running ??= _run().whenComplete(() {
      _running = null;
    });
  }

  Future<SyncReport> _run() async {
    if (!await connectivity.isOnline()) return const SyncReport(offline: true);

    // Only one run is ever active, so anything still marked `syncing` was
    // left behind by an app that was killed mid-sync.
    await dao.recoverInterrupted();

    final tally = _Tally();
    var batch = await dao.fetchDue(now: _now(), limit: batchSize);
    while (batch.isNotEmpty) {
      await _syncBatch(batch, tally);
      if (tally.stop) break;
      batch = await dao.fetchDue(now: _now(), limit: batchSize);
    }
    return SyncReport(
      synced: tally.synced,
      failed: tally.failed,
      deferred: tally.deferred,
      sessionExpired: tally.sessionExpired,
    );
  }

  Future<void> _syncBatch(List<PendingSync> batch, _Tally tally) async {
    final startedAt = _now();
    for (final item in batch) {
      await dao.markSyncing(item, startedAt);
    }

    final String serverDeviceId;
    try {
      serverDeviceId = await identity.serverDeviceId();
    } on NetworkException catch (error) {
      await _fail(batch, error, tally);
      return;
    }

    final uploads = [for (final item in batch) _toUpload(item, serverDeviceId)];
    try {
      await remote.pushInspections(uploads);
    } on NetworkException catch (error) {
      if (_classify(error) == _Outcome.permanent && batch.length > 1) {
        await _pushOneByOne(batch, serverDeviceId, tally);
      } else {
        await _fail(batch, error, tally);
      }
      return;
    }
    await _uploadImages(batch, tally);
  }

  // One rejected record must not hold back the others in its batch.
  Future<void> _pushOneByOne(
    List<PendingSync> batch,
    String serverDeviceId,
    _Tally tally,
  ) async {
    final pushed = <PendingSync>[];
    for (var i = 0; i < batch.length; i++) {
      try {
        await remote.pushInspections([_toUpload(batch[i], serverDeviceId)]);
        pushed.add(batch[i]);
      } on NetworkException catch (error) {
        if (_classify(error) == _Outcome.permanent) {
          await _fail([batch[i]], error, tally);
          continue;
        }
        // Not this record's fault, so everything unsent goes back.
        await _fail([...batch.skip(i), ...pushed], error, tally);
        return;
      }
    }
    await _uploadImages(pushed, tally);
  }

  Future<void> _uploadImages(List<PendingSync> items, _Tally tally) async {
    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      try {
        if (!item.entry.imageUploaded) {
          await remote.uploadImage(
            inspectionId: item.inspection.id,
            imagePath: item.inspection.imagePath,
          );
          await dao.markImageUploaded(item.entry.id);
        }
        await dao.markSynced(item);
        tally.synced++;
      } on NetworkException catch (error) {
        if (_classify(error) == _Outcome.permanent) {
          await _fail([item], error, tally);
          continue;
        }
        await _fail(items.skip(i), error, tally);
        return;
      }
    }
  }

  /// Applies [error] to [items], and stops the run when trying again right
  /// now would not help.
  Future<void> _fail(
    Iterable<PendingSync> items,
    NetworkException error,
    _Tally tally,
  ) async {
    final outcome = _classify(error);
    for (final item in items) {
      switch (outcome) {
        case _Outcome.permanent:
          await dao.markFailed(item, error: error.message);
          tally.failed++;
        case _Outcome.temporary:
          final delay = backoffDelay(
            item.entry.attemptCount + 1,
            random: _random,
          );
          await dao.markRetryLater(
            item,
            nextAttemptAt: _now().add(delay),
            error: error.message,
          );
          tally.deferred++;
        case _Outcome.sessionExpired:
          await dao.markRetryLater(
            item,
            nextAttemptAt: _now(),
            error: error.message,
          );
          tally.deferred++;
      }
    }
    if (outcome != _Outcome.permanent) tally.stop = true;
    if (outcome == _Outcome.sessionExpired) tally.sessionExpired = true;
  }

  InspectionUpload _toUpload(PendingSync item, String serverDeviceId) {
    return InspectionUpload(
      id: item.inspection.id,
      serverDeviceId: serverDeviceId,
      capturedAt: item.inspection.capturedAt,
      predictedClass: item.inspection.predictedClass,
      confidence: item.inspection.confidence,
      correctedClass: item.inspection.correctedClass,
      isAccepted: item.inspection.isAccepted,
      latitude: item.inspection.latitude,
      longitude: item.inspection.longitude,
    );
  }
}
