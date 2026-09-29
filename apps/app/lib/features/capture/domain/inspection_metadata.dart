/// Metadata captured alongside a photo. Plain immutable class for now —
/// Day 9 converts model classes to Freezed + json_serializable.
class InspectionMetadata {
  /// Creates the metadata.
  const new({
    required this.capturedAt,
    required this.deviceId,
    this.latitude,
    this.longitude,
  });

  /// When the photo was taken.
  final DateTime capturedAt;

  /// Stable identifier for this device.
  final String deviceId;

  /// Optional GPS latitude, if location was granted.
  final double? latitude;

  /// Optional GPS longitude, if location was granted.
  final double? longitude;
}
