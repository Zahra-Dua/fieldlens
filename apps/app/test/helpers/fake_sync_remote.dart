import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';

/// Test double for the server. Records what it was sent and fails on cue.
class FakeSyncRemote implements SyncRemote {
  /// Ids of each pushed batch, in call order.
  final pushed = <List<String>>[];

  /// Inspection ids whose photo was uploaded.
  final uploadedImages = <String>[];

  /// Inspection ids the server will reject with a 400.
  final rejectIds = <String>{};

  /// Thrown by every push while set.
  NetworkException? pushError;

  /// Thrown by every image upload while set.
  NetworkException? imageError;

  /// How many times the device was registered.
  int registerCalls = 0;

  @override
  Future<String> registerDevice({required String deviceUuid}) async {
    registerCalls++;
    return 'server-device';
  }

  @override
  Future<void> pushInspections(List<InspectionUpload> uploads) async {
    pushed.add([for (final upload in uploads) upload.id]);
    final error = pushError;
    if (error != null) throw error;
    if (uploads.any((upload) => rejectIds.contains(upload.id))) {
      throw const ApiRejectedException('Validation failed', statusCode: 400);
    }
  }

  @override
  Future<void> uploadImage({
    required String inspectionId,
    required String imagePath,
  }) async {
    final error = imageError;
    if (error != null) throw error;
    uploadedImages.add(inspectionId);
  }
}
