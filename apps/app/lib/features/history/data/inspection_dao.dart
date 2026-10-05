import 'package:drift/drift.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/database/tables.dart';

/// An outbox entry together with the inspection it points at.
class PendingSync {
  /// Creates a pairing of [entry] and [inspection].
  const PendingSync({required this.entry, required this.inspection});

  /// The queue row.
  final OutboxEntry entry;

  /// The inspection that row belongs to.
  final Inspection inspection;
}

/// Queries and writes for inspections and their outbox entries.
class InspectionDao {
  /// Creates the DAO over an open [AppDatabase].
  InspectionDao(this._db);

  final AppDatabase _db;

  /// All inspections, newest first, updating live as rows change.
  Stream<List<Inspection>> watchAll() {
    return (_db.select(
      _db.inspections,
    )..orderBy([(t) => OrderingTerm.desc(t.capturedAt)])).watch();
  }

  /// Saves a new inspection and queues it for sync, in one transaction so
  /// a crash between the two writes cannot leave an inspection with no
  /// outbox entry.
  Future<void> createInspection({
    required String id,
    required String imagePath,
    required DateTime capturedAt,
    required String deviceId,
    double? latitude,
    double? longitude,
  }) {
    return _db.transaction(() async {
      await _db
          .into(_db.inspections)
          .insert(
            InspectionsCompanion.insert(
              id: id,
              imagePath: imagePath,
              capturedAt: capturedAt,
              deviceId: deviceId,
              latitude: Value(latitude),
              longitude: Value(longitude),
            ),
          );
      await _db
          .into(_db.outboxEntries)
          .insert(OutboxEntriesCompanion.insert(inspectionId: id));
    });
  }

  /// Updates an inspection's sync status. Used by the Day 10 sync worker,
  /// and here to verify the history screen's live stream actually reacts
  /// to a status change rather than only to new rows.
  Future<void> updateSyncStatus(String id, String status) {
    return (_db.update(_db.inspections)..where((t) => t.id.equals(id))).write(
      InspectionsCompanion(syncStatus: Value(status)),
    );
  }

  /// Entries that may be tried now, oldest first.
  Future<List<PendingSync>> fetchDue({required DateTime now, int limit = 20}) {
    final outbox = _db.outboxEntries;
    final query =
        _db.select(outbox).join([
            innerJoin(
              _db.inspections,
              _db.inspections.id.equalsExp(outbox.inspectionId),
            ),
          ])
          ..where(
            outbox.status.equals(OutboxStatus.pending) &
                (outbox.nextAttemptAt.isNull() |
                    outbox.nextAttemptAt.isSmallerOrEqualValue(now)),
          )
          ..orderBy([OrderingTerm.asc(outbox.id)])
          ..limit(limit);
    return query
        .map(
          (row) => PendingSync(
            entry: row.readTable(outbox),
            inspection: row.readTable(_db.inspections),
          ),
        )
        .get();
  }

  /// Marks [item] as being sent and counts the attempt.
  Future<void> markSyncing(PendingSync item, DateTime now) {
    return _db.transaction(() async {
      await (_db.update(
        _db.outboxEntries,
      )..where((t) => t.id.equals(item.entry.id))).write(
        OutboxEntriesCompanion(
          status: const Value(OutboxStatus.syncing),
          attemptCount: Value(item.entry.attemptCount + 1),
          lastAttemptAt: Value(now),
        ),
      );
      await updateSyncStatus(item.inspection.id, InspectionSyncStatus.syncing);
    });
  }

  /// Remembers that the photo reached the server, so a retry skips it.
  Future<void> markImageUploaded(int outboxId) {
    return (_db.update(_db.outboxEntries)..where((t) => t.id.equals(outboxId)))
        .write(const OutboxEntriesCompanion(imageUploaded: Value(true)));
  }

  /// The server has it: drop the queue row and mark the inspection synced.
  Future<void> markSynced(PendingSync item) {
    return _db.transaction(() async {
      await (_db.delete(
        _db.outboxEntries,
      )..where((t) => t.id.equals(item.entry.id))).go();
      await updateSyncStatus(item.inspection.id, InspectionSyncStatus.synced);
    });
  }

  /// A temporary failure: try again at [nextAttemptAt].
  Future<void> markRetryLater(
    PendingSync item, {
    required DateTime nextAttemptAt,
    required String error,
  }) {
    return _db.transaction(() async {
      await (_db.update(
        _db.outboxEntries,
      )..where((t) => t.id.equals(item.entry.id))).write(
        OutboxEntriesCompanion(
          status: const Value(OutboxStatus.pending),
          nextAttemptAt: Value(nextAttemptAt),
          lastError: Value(error),
        ),
      );
      await updateSyncStatus(item.inspection.id, InspectionSyncStatus.pending);
    });
  }

  /// A permanent failure: stop retrying until the user asks.
  Future<void> markFailed(PendingSync item, {required String error}) {
    return _db.transaction(() async {
      await (_db.update(
        _db.outboxEntries,
      )..where((t) => t.id.equals(item.entry.id))).write(
        OutboxEntriesCompanion(
          status: const Value(OutboxStatus.failed),
          lastError: Value(error),
        ),
      );
      await updateSyncStatus(item.inspection.id, InspectionSyncStatus.failed);
    });
  }

  /// Manual retry of a failed inspection.
  Future<void> retryFailed(String inspectionId) {
    return _db.transaction(() async {
      await (_db.update(
        _db.outboxEntries,
      )..where((t) => t.inspectionId.equals(inspectionId))).write(
        const OutboxEntriesCompanion(
          status: Value(OutboxStatus.pending),
          attemptCount: Value(0),
          nextAttemptAt: Value<DateTime?>(null),
          lastError: Value<String?>(null),
        ),
      );
      await updateSyncStatus(inspectionId, InspectionSyncStatus.pending);
    });
  }

  /// Run at app start: anything left in `syncing` means the app was killed
  /// mid-sync, so put it back in the queue. Safe because the server upsert
  /// is idempotent.
  Future<void> recoverInterrupted() {
    return _db.transaction(() async {
      await (_db.update(
        _db.outboxEntries,
      )..where((t) => t.status.equals(OutboxStatus.syncing))).write(
        const OutboxEntriesCompanion(status: Value(OutboxStatus.pending)),
      );
      await (_db.update(
        _db.inspections,
      )..where((t) => t.syncStatus.equals(InspectionSyncStatus.syncing))).write(
        const InspectionsCompanion(
          syncStatus: Value(InspectionSyncStatus.pending),
        ),
      );
    });
  }

  /// Reads a sync-state value, such as the last-synced watermark.
  Future<String?> readMeta(String key) async {
    final row = await (_db.select(
      _db.syncMetaEntries,
    )..where((t) => t.metaKey.equals(key))).getSingleOrNull();
    return row?.metaValue;
  }

  /// Stores a sync-state value, replacing any existing one.
  Future<void> writeMeta(String key, String value) {
    return _db
        .into(_db.syncMetaEntries)
        .insertOnConflictUpdate(
          SyncMetaEntriesCompanion.insert(metaKey: key, metaValue: value),
        );
  }

  /// When the next backed-off entry becomes due, so a retry can be
  /// scheduled. Null when nothing is waiting.
  Future<DateTime?> earliestRetryAt() async {
    final rows =
        await (_db.select(_db.outboxEntries)
              ..where(
                (t) =>
                    t.status.equals(OutboxStatus.pending) &
                    t.nextAttemptAt.isNotNull(),
              )
              ..orderBy([(t) => OrderingTerm.asc(t.nextAttemptAt)])
              ..limit(1))
            .get();
    return rows.isEmpty ? null : rows.single.nextAttemptAt;
  }

  /// Makes every waiting entry due now, for a manual "Sync now".
  Future<void> clearBackoff() {
    return (_db.update(
      _db.outboxEntries,
    )..where((t) => t.status.equals(OutboxStatus.pending))).write(
      const OutboxEntriesCompanion(nextAttemptAt: Value<DateTime?>(null)),
    );
  }
}
