import 'package:drift/drift.dart';
import 'package:fieldlens_app/core/database/app_database.dart';

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
}
