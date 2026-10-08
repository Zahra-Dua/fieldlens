/// One inspection ready to be sent to the server.
class InspectionUpload {
  /// Creates the upload data for one inspection.
  const InspectionUpload({
    required this.id,
    required this.serverDeviceId,
    required this.capturedAt,
    this.predictedClass,
    this.confidence,
    this.correctedClass,
    this.isAccepted,
    this.latitude,
    this.longitude,
  });

  /// Client-generated UUID, the key of the server's idempotent upsert.
  final String id;

  /// The id the server gave this device at registration.
  final String serverDeviceId;

  /// When the photo was taken.
  final DateTime capturedAt;

  /// On-device prediction. Null only for legacy records captured pre-Day 14.
  final String? predictedClass;

  /// Confidence for [predictedClass].
  final double? confidence;

  /// User-provided label correction, if different from the prediction.
  final String? correctedClass;

  /// Whether the worker accepted the model's prediction.
  final bool? isAccepted;

  /// Optional GPS latitude.
  final double? latitude;

  /// Optional GPS longitude.
  final double? longitude;
}

/// What the sync worker needs from the server, independent of Dio.
abstract interface class SyncRemote {
  /// Registers this device (safe to repeat) and returns the server's id.
  Future<String> registerDevice({required String deviceUuid});

  /// Creates or updates inspections. Safe to repeat for the same ids.
  Future<void> pushInspections(List<InspectionUpload> uploads);

  /// Uploads the photo for [inspectionId].
  Future<void> uploadImage({
    required String inspectionId,
    required String imagePath,
  });
}
