import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase db;
  late InspectionDao dao;
  final now = DateTime(2026, 10, 2, 12);

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    dao = InspectionDao(db);
  });

  tearDown(() => db.close());

  Future<void> create(String id) => dao.createInspection(
    id: id,
    imagePath: '/tmp/$id.jpg',
    capturedAt: now,
    deviceId: 'device',
  );

  test('fetchDue skips entries whose backoff has not elapsed', () async {
    await create('a');
    await create('b');
    final due = await dao.fetchDue(now: now);
    await dao.markRetryLater(
      due.first,
      nextAttemptAt: now.add(const Duration(minutes: 1)),
      error: 'server error',
    );

    expect((await dao.fetchDue(now: now)).length, 1);
    final later = now.add(const Duration(minutes: 2));
    expect((await dao.fetchDue(now: later)).length, 2);
  });

  test('markSynced removes the queue row and marks the inspection', () async {
    await create('a');
    final item = (await dao.fetchDue(now: now)).single;

    await dao.markSynced(item);

    expect(await dao.fetchDue(now: now), isEmpty);
    final row = await db.select(db.inspections).getSingle();
    expect(row.syncStatus, InspectionSyncStatus.synced);
  });

  test('recoverInterrupted puts a killed sync back in the queue', () async {
    await create('a');
    final item = (await dao.fetchDue(now: now)).single;
    await dao.markSyncing(item, now);
    expect(await dao.fetchDue(now: now), isEmpty);

    await dao.recoverInterrupted();

    expect((await dao.fetchDue(now: now)).length, 1);
    final row = await db.select(db.inspections).getSingle();
    expect(row.syncStatus, InspectionSyncStatus.pending);
  });

  test('markFailed stops retries until retryFailed is called', () async {
    await create('a');
    final item = (await dao.fetchDue(now: now)).single;

    await dao.markFailed(item, error: 'rejected');
    expect(await dao.fetchDue(now: now), isEmpty);

    await dao.retryFailed('a');
    expect((await dao.fetchDue(now: now)).length, 1);
  });
  test('clearBackoff makes waiting entries due immediately', () async {
    await create('a');
    final item = (await dao.fetchDue(now: now)).single;
    await dao.markRetryLater(
      item,
      nextAttemptAt: now.add(const Duration(minutes: 5)),
      error: 'server error',
    );
    expect(await dao.fetchDue(now: now), isEmpty);

    await dao.clearBackoff();

    expect((await dao.fetchDue(now: now)).length, 1);
  });
}
