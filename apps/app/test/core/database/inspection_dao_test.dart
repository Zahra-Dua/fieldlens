import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late AppDatabase db;
  late InspectionDao dao;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    dao = InspectionDao(db);
  });

  tearDown(() => db.close());

  test('createInspection writes an inspection and an outbox entry', () async {
    await dao.createInspection(
      id: 'test-id-1',
      imagePath: '/fake/path.jpg',
      capturedAt: DateTime(2026),
      deviceId: 'device-1',
      predictedClass: 'PLASTIC',
      confidence: 0.82,
      isUncertain: false,
      correctedClass: 'GLASS',
      isAccepted: false,
    );

    final rows = await dao.watchAll().first;
    expect(rows, hasLength(1));
    expect(rows.single.id, 'test-id-1');
    expect(rows.single.syncStatus, 'pending');
    expect(rows.single.predictedClass, 'PLASTIC');
    expect(rows.single.confidence, 0.82);
    expect(rows.single.isUncertain, isFalse);
    expect(rows.single.correctedClass, 'GLASS');
    expect(rows.single.isAccepted, isFalse);

    final outboxRows = await db.select(db.outboxEntries).get();
    expect(outboxRows, hasLength(1));
    expect(outboxRows.single.inspectionId, 'test-id-1');
  });

  test('watchAll emits newest inspection first', () async {
    await dao.createInspection(
      id: 'older',
      imagePath: '/a.jpg',
      capturedAt: DateTime(2026),
      deviceId: 'device-1',
    );
    await dao.createInspection(
      id: 'newer',
      imagePath: '/b.jpg',
      capturedAt: DateTime(2026, 1, 2),
      deviceId: 'device-1',
    );

    final rows = await dao.watchAll().first;
    expect(rows.first.id, 'newer');
  });

  test('watchAll emits again when a row status changes', () async {
    await dao.createInspection(
      id: 'test-id-2',
      imagePath: '/fake/path.jpg',
      capturedAt: DateTime(2026),
      deviceId: 'device-1',
    );

    final stream = dao.watchAll();
    final emissions = <String>[];
    final subscription = stream.listen(
      (rows) => emissions.add(rows.single.syncStatus),
    );

    // Let the first emission (pending) land before changing anything.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await dao.updateSyncStatus('test-id-2', 'synced');
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await subscription.cancel();

    expect(emissions, containsAllInOrder(['pending', 'synced']));
  });
}
