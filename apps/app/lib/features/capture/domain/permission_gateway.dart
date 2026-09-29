/// Runtime permissions the capture flow needs.
enum AppPermission {
  /// Needed to show the live preview and take a photo.
  camera,

  /// Optional: attaches coordinates to an inspection.
  location,
}

/// Result of checking or requesting a permission.
enum PermissionOutcome {
  /// The user allowed it.
  granted,

  /// Not allowed right now, but the system dialog can be shown again.
  denied,

  /// The system will not show the dialog again. Only Settings can fix it.
  permanentlyDenied,
}

/// What the capture flow needs from the OS permission system, independent
/// of any plugin.
abstract interface class PermissionGateway {
  /// Current state, without showing a dialog.
  Future<PermissionOutcome> status(AppPermission permission);

  /// Shows the system dialog if the OS still allows it.
  Future<PermissionOutcome> request(AppPermission permission);

  /// Opens this app's page in system Settings.
  Future<bool> openSettings();
}
