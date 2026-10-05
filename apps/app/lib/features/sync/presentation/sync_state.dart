import 'package:fieldlens_app/features/sync/data/sync_worker.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

part 'sync_state.freezed.dart';

/// What the sync controller is doing, for the UI.
@freezed
abstract class SyncState with _$SyncState {
  /// Creates a sync state. Everything is idle by default.
  const factory SyncState({
    @Default(false) bool syncing,
    DateTime? lastSyncedAt,
    SyncReport? lastReport,
  }) = _SyncState;
}
