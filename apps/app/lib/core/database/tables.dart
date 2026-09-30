import 'package:drift/drift.dart';

/// A captured inspection: the photo, its metadata, and its current sync
/// state. The id is client-generated so it matches the UUID the server's
/// idempotent upsert (Day 4) expects.
class Inspections extends Table {
  /// Client-generated UUID. Same id the server upsert keys on.
  TextColumn get id => text()();

  /// Path to the compressed photo on this device's filesystem. Image
  /// bytes are never stored in the database itself.
  TextColumn get imagePath => text()();

  /// When the photo was captured.
  DateTimeColumn get capturedAt => dateTime()();

  /// Identifier for the device that captured this inspection.
  TextColumn get deviceId => text()();

  /// Optional GPS latitude.
  RealColumn get latitude => real().nullable()();

  /// Optional GPS longitude.
  RealColumn get longitude => real().nullable()();

  /// Current sync state, stored as text (see [InspectionSyncStatus]).
  TextColumn get syncStatus => text().withDefault(const Constant('pending'))();

  /// Row creation time.
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();

  /// Row last-updated time.
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();

  /// Optional field-worker note, added in schema v2.
  TextColumn get notes => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// The sync queue. One row per inspection waiting to be pushed to the
/// server. A row is removed once its inspection reaches `synced`.
class OutboxEntries extends Table {
  /// Auto-incrementing row id — this table's own identity, not the
  /// inspection's.
  IntColumn get id => integer().autoIncrement()();

  /// The inspection this entry is trying to sync.
  TextColumn get inspectionId => text().references(Inspections, #id)();

  /// How many sync attempts have been made for this entry.
  IntColumn get attemptCount => integer().withDefault(const Constant(0))();

  /// When the last attempt happened, if any.
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();

  /// Queue state, stored as text (see [OutboxStatus]).
  TextColumn get status => text().withDefault(const Constant('pending'))();
}

/// Values stored in [Inspections.syncStatus]. Kept as plain strings in the
/// column (not a Drift enum column) so a manual SQL inspection during
/// debugging is still human-readable.
abstract final class InspectionSyncStatus {
  /// Waiting to be picked up by the sync worker.
  static const pending = 'pending';

  /// Currently being uploaded.
  static const syncing = 'syncing';

  /// Confirmed saved on the server.
  static const synced = 'synced';

  /// Upload failed and will not be retried automatically.
  static const failed = 'failed';
}

/// Values stored in [OutboxEntries.status].
abstract final class OutboxStatus {
  /// Waiting for the sync worker.
  static const pending = 'pending';

  /// Currently being processed.
  static const syncing = 'syncing';

  /// Failed and needs manual retry (Day 10 requirement: a 400-class
  /// failure must not be retried forever).
  static const failed = 'failed';
}
