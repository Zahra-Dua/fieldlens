import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

// The tables exactly as schema version 2 created them, so the upgrade runs
// against a database that really looks like one from an older install.
const _schemaV2 = '''
CREATE TABLE inspections (
  id TEXT NOT NULL PRIMARY KEY,
  image_path TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  latitude REAL NULL,
  longitude REAL NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL
);
CREATE TABLE outbox_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  inspection_id TEXT NOT NULL REFERENCES inspections (id),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
INSERT INTO inspections (id, image_path, captured_at, device_id)
  VALUES ('old', '/tmp/old.jpg', 1790000000, 'device');
INSERT INTO outbox_entries (inspection_id) VALUES ('old');
PRAGMA user_version = 2;
''';

void main() {
  test('upgrading from v2 keeps old rows and adds v3 and v4 columns', () async {
    final raw = sqlite3.openInMemory()..execute(_schemaV2);
    final db = AppDatabase.forTesting(NativeDatabase.opened(raw));
    final dao = InspectionDao(db);

    // The old inspection and its queue entry survived the upgrade.
    final due = await dao.fetchDue(now: DateTime.now());
    expect(due.single.inspection.id, 'old');

    // The new outbox columns exist, with their defaults.
    expect(due.single.entry.imageUploaded, isFalse);
    expect(due.single.entry.nextAttemptAt, isNull);
    expect(due.single.entry.lastError, isNull);
    expect(due.single.inspection.predictedClass, isNull);
    expect(due.single.inspection.confidence, isNull);
    expect(due.single.inspection.correctedClass, isNull);

    // The new key-value table is usable.
    await dao.writeMeta(SyncMetaKeys.lastPushAt, 'x');
    expect(await dao.readMeta(SyncMetaKeys.lastPushAt), 'x');

    await db.close();
  });
}
