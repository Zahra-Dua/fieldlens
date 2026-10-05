import 'dart:math';

import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/data/device_identity.dart';
import 'package:fieldlens_app/features/sync/data/sync_worker.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_connectivity_gateway.dart';
import '../../helpers/fake_sync_remote.dart';

void main() {
  late AppDatabase db;
  late InspectionDao dao;
  late FakeSyncRemote remote;
  late FakeConnectivityGateway connectivity;
  late SyncWorker worker;
  final clock = DateTime(2026, 10, 3, 12);

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    dao = InspectionDao(db);
    remote = FakeSyncRemote();
    connectivity = FakeConnectivityGateway();
    worker = SyncWorker(
      dao: dao,
      remote: remote,
      identity: DeviceIdentity(dao: dao, remote: remote),
      connectivity: connectivity,
      now: () => clock,
      random: Random(1),
      batchSize: 2,
    );
  });

  tearDown(() => db.close());

  Future<void> create(String id) => dao.createInspection(
    id: id,
    imagePath: '/tmp/$id.jpg',
    capturedAt: clock,
    deviceId: 'device',
  );

  Future<String> statusOf(String id) async {
    final row = await (db.select(
      db.inspections,
    )..where((t) => t.id.equals(id))).getSingle();
    return row.syncStatus;
  }

  test('drains the outbox in batches and registers the device once', () async {
    for (final id in ['a', 'b', 'c', 'd', 'e']) {
      await create(id);
    }

    final report = await worker.syncNow();
    await worker.syncNow();

    expect(report.synced, 5);
    expect(remote.pushed.map((batch) => batch.length), [2, 2, 1]);
    expect(remote.uploadedImages, hasLength(5));
    expect(await dao.fetchDue(now: clock), isEmpty);
    expect(remote.registerCalls, 1);
  });

  test('a server error backs off instead of retrying straight away', () async {
    remote.pushError = const ServerUnavailableException();
    await create('a');
    await create('b');

    final report = await worker.syncNow();
    await worker.syncNow();

    expect(report.deferred, 2);
    expect(remote.pushed, hasLength(1));
    expect(await statusOf('a'), InspectionSyncStatus.pending);
    expect(await dao.fetchDue(now: clock), isEmpty);
    final later = clock.add(const Duration(minutes: 10));
    expect(await dao.fetchDue(now: later), hasLength(2));
  });

  test('one rejected record does not block the others', () async {
    remote.rejectIds.add('b');
    await create('a');
    await create('b');
    await create('c');

    final report = await worker.syncNow();

    expect(report.synced, 2);
    expect(report.failed, 1);
    expect(await statusOf('a'), InspectionSyncStatus.synced);
    expect(await statusOf('b'), InspectionSyncStatus.failed);
    expect(await statusOf('c'), InspectionSyncStatus.synced);
  });

  test('a failed record is not retried until the user asks', () async {
    remote.rejectIds.add('a');
    await create('a');

    await worker.syncNow();
    final pushesAfterFirstRun = remote.pushed.length;
    await worker.syncNow();

    expect(remote.pushed.length, pushesAfterFirstRun);

    remote.rejectIds.clear();
    await dao.retryFailed('a');
    final report = await worker.syncNow();

    expect(report.synced, 1);
  });

  test('does nothing while offline', () async {
    connectivity.online = false;
    await create('a');

    final report = await worker.syncNow();

    expect(report.offline, isTrue);
    expect(remote.pushed, isEmpty);
    expect(await statusOf('a'), InspectionSyncStatus.pending);
  });

  test('a killed sync is recovered and sent exactly once', () async {
    await create('a');
    final item = (await dao.fetchDue(now: clock)).single;
    await dao.markSyncing(item, clock);

    final report = await worker.syncNow();

    expect(report.synced, 1);
    expect(remote.pushed.single, ['a']);
  });

  test('skips the photo when it was uploaded before a kill', () async {
    await create('a');
    final item = (await dao.fetchDue(now: clock)).single;
    await dao.markImageUploaded(item.entry.id);

    final report = await worker.syncNow();

    expect(report.synced, 1);
    expect(remote.uploadedImages, isEmpty);
  });

  test('an expired session stops the run and keeps the data', () async {
    remote.pushError = const SessionExpiredException();
    await create('a');

    final report = await worker.syncNow();

    expect(report.sessionExpired, isTrue);
    expect(await statusOf('a'), InspectionSyncStatus.pending);
    expect(await dao.fetchDue(now: clock), hasLength(1));
  });

  test('two triggers at once share a single run', () async {
    await create('a');

    final first = worker.syncNow();
    final second = worker.syncNow();

    expect(identical(first, second), isTrue);
    await first;
    expect(remote.pushed, hasLength(1));
  });
}
