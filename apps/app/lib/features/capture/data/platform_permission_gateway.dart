import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:permission_handler/permission_handler.dart';

/// [PermissionGateway] backed by the `permission_handler` plugin.
class PlatformPermissionGateway implements PermissionGateway {
  @override
  Future<PermissionOutcome> status(AppPermission permission) async {
    return _toOutcome(await _toPlugin(permission).status);
  }

  @override
  Future<PermissionOutcome> request(AppPermission permission) async {
    return _toOutcome(await _toPlugin(permission).request());
  }

  @override
  Future<bool> openSettings() => openAppSettings();

  Permission _toPlugin(AppPermission permission) {
    return switch (permission) {
      AppPermission.camera => Permission.camera,
      AppPermission.location => Permission.locationWhenInUse,
    };
  }

  PermissionOutcome _toOutcome(PermissionStatus status) {
    if (status.isGranted) return PermissionOutcome.granted;
    // Restricted (e.g. iOS parental controls) cannot be changed from inside
    // the app, so it shares the permanently-denied recovery path.
    if (status.isPermanentlyDenied || status.isRestricted) {
      return PermissionOutcome.permanentlyDenied;
    }
    return PermissionOutcome.denied;
  }
}
