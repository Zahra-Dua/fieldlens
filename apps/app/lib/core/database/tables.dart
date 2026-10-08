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

  /// On-device model prediction; null for inspections made before Day 14.
  TextColumn get predictedClass => text().nullable()();

  /// Model confidence in the predicted class, from 0 to 1.
  RealColumn get confidence => real().nullable()();

  /// Whether confidence was below the app's threshold when captured.
  BoolColumn get isUncertain => boolean().nullable()();

  /// Worker correction, only set when it differs from the prediction.
  TextColumn get correctedClass => text().nullable()();

  /// Whether the worker accepted the prediction or supplied a correction.
  BoolColumn get isAccepted => boolean().nullable()();

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

  /// True once the photo has been uploaded, so a retry does not upload it
  /// again. Added in schema v3.
  BoolColumn get imageUploaded =>
      boolean().withDefault(const Constant(false))();

  /// Earliest time the next attempt may run. Null means as soon as
  /// possible. Stored in the database so the backoff survives a restart.
  DateTimeColumn get nextAttemptAt => dateTime().nullable()();

  /// Message from the last failed attempt, shown to the user. Added in
  /// schema v3.
  TextColumn get lastError => text().nullable()();
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

/// Small key-value store for sync state, such as the last-synced
/// watermark and the server-issued device id. Added in schema v3.
class SyncMetaEntries extends Table {
  /// Name of the stored value, see [SyncMetaKeys].
  TextColumn get metaKey => text()();

  /// The stored value.
  TextColumn get metaValue => text()();

  @override
  Set<Column> get primaryKey => {metaKey};
}

/// Keys used in [SyncMetaEntries].
abstract final class SyncMetaKeys {
  /// The id the server assigned this device at registration.
  static const serverDeviceId = 'server_device_id';

  /// Random id this install uses to register itself with the server.
  static const deviceUuid = 'device_uuid';

  /// ISO-8601 server time of the last successful push.
  static const lastPushAt = 'last_push_at';
}
