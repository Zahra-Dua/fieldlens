import 'package:fieldlens_app/features/capture/domain/inspection_metadata.dart'
    show InspectionMetadata;

/// What the capture flow needs from the OS to build [InspectionMetadata],
/// independent of any plugin.
abstract interface class MetadataGateway {
  /// A stable identifier for this device.
  Future<String> deviceId();

  /// Current GPS position, or null if location is unavailable/denied.
  Future<({double latitude, double longitude})?> currentLocation();
}
