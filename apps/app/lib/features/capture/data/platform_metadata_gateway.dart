import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:fieldlens_app/features/capture/domain/metadata_gateway.dart';
import 'package:geolocator/geolocator.dart';

/// [MetadataGateway] backed by device_info_plus and geolocator.
class PlatformMetadataGateway implements MetadataGateway {
  final _deviceInfo = DeviceInfoPlugin();

  @override
  Future<String> deviceId() async {
    if (Platform.isAndroid) {
      final info = await _deviceInfo.androidInfo;
      return info.id;
    }
    if (Platform.isIOS) {
      final info = await _deviceInfo.iosInfo;
      return info.identifierForVendor ?? 'unknown-ios-device';
    }
    return 'unknown-device';
  }

  @override
  Future<({double latitude, double longitude})?> currentLocation() async {
    // Caller is responsible for permission — this assumes AppPermission
    // .location was already granted via PermissionGateway.
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      );
      return (latitude: position.latitude, longitude: position.longitude);
    } on Exception catch (_) {
      return null;
    }
  }
}
