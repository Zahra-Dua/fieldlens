import 'package:fieldlens_app/core/database/tables.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';
import 'package:uuid/uuid.dart';

/// Gives the sync worker the server's id for this device, registering it
/// on first use.
class DeviceIdentity {
  /// Creates the identity helper.
  DeviceIdentity({required this.dao, required this.remote});

  /// Where the ids are cached.
  final InspectionDao dao;

  /// Used to register the device on first run.
  final SyncRemote remote;

  /// The server-issued id for this device.
  Future<String> serverDeviceId() async {
    final cached = await dao.readMeta(SyncMetaKeys.serverDeviceId);
    if (cached != null) return cached;

    // Generated once and kept. Android's build id is shared by every phone
    // on the same firmware, so it cannot identify a device.
    var deviceUuid = await dao.readMeta(SyncMetaKeys.deviceUuid);
    if (deviceUuid == null) {
      deviceUuid = const Uuid().v4();
      await dao.writeMeta(SyncMetaKeys.deviceUuid, deviceUuid);
    }

    final serverId = await remote.registerDevice(deviceUuid: deviceUuid);
    await dao.writeMeta(SyncMetaKeys.serverDeviceId, serverId);
    return serverId;
  }
}
