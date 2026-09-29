import 'dart:async';

import 'package:camera/camera.dart' as pkg;
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:flutter/cupertino.dart' show WidgetsBindingObserver;
import 'package:flutter/material.dart' show WidgetsBindingObserver;
import 'package:flutter/widgets.dart' show WidgetsBindingObserver;
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What the capture screen currently shows.
sealed class CaptureState {
  const new();
}

/// Checking or requesting the camera permission.
class CaptureCheckingPermission extends CaptureState {
  /// Creates a [CaptureCheckingPermission].
  const new();
}

/// Permission not granted yet, but the system dialog can still be shown.
class CaptureNeedsPermission extends CaptureState {
  /// Creates a [CaptureNeedsPermission].
  const new();
}

/// The system will not show the permission dialog again — only Settings
/// can fix it.
class CapturePermissionPermanentlyDenied extends CaptureState {
  /// Creates a [CapturePermissionPermanentlyDenied].
  const new();
}

/// Camera permission granted and the preview is ready.
class CaptureReady extends CaptureState {
  /// Creates a [CaptureReady].
  const new(this.controller);

  /// The initialised camera controller. Safe to feed a [pkg.CameraPreview].
  final pkg.CameraController controller;
}

/// Something about camera setup failed (no camera on device, plugin
/// error, etc — distinct from a permission problem).
class CaptureError extends CaptureState {
  /// Creates a [CaptureError].
  const new(this.message);

  /// Human-readable explanation shown to the user.
  final String message;
}

/// Drives the capture screen: requests the camera permission, opens the
/// camera once granted, and releases it when the app is backgrounded.
///
/// Kept as a plain [Notifier] rather than an app-wide [WidgetsBindingObserver]
/// because only the capture screen cares about camera lifecycle — the rest
/// of the app does not need to react to background/resume.
class CameraControllerNotifier extends Notifier<CaptureState> {
  pkg.CameraController? _controller;

  @override
  CaptureState build() {
    ref.onDispose(_disposeController);

    /// Start the permission check after the first frame, so the screen can
    /// show a loading indicator while the OS dialog is being shown.

    unawaited(Future.microtask(_start));
    return const CaptureCheckingPermission();
  }

  Future<void> _start() async {
    final gateway = ref.read(permissionGatewayProvider);
    final outcome = await gateway.status(AppPermission.camera);

    switch (outcome) {
      case PermissionOutcome.granted:
        await _openCamera();
      case PermissionOutcome.denied:
        state = const CaptureNeedsPermission();
      case PermissionOutcome.permanentlyDenied:
        state = const CapturePermissionPermanentlyDenied();
    }
  }

  /// Shows the system permission dialog. Call from a button tap, never
  /// automatically — the OS only allows this once without count as a
  /// "denial" the user didn't consciously make.
  Future<void> requestPermission() async {
    final gateway = ref.read(permissionGatewayProvider);
    final outcome = await gateway.request(AppPermission.camera);

    switch (outcome) {
      case PermissionOutcome.granted:
        await _openCamera();
      case PermissionOutcome.denied:
        state = const CaptureNeedsPermission();
      case PermissionOutcome.permanentlyDenied:
        state = const CapturePermissionPermanentlyDenied();
    }
  }

  /// Opens the system Settings page for this app, so the user can manually
  /// grant the camera permission.
  Future<void> openSettings() =>
      ref.read(permissionGatewayProvider).openSettings();

  Future<void> _openCamera() async {
    try {
      final cameras = await pkg.availableCameras();
      if (cameras.isEmpty) {
        state = const CaptureError('No camera found on this device.');
        return;
      }

      final controller = pkg.CameraController(
        cameras.first,
        pkg.ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();

      _controller = controller;
      state = CaptureReady(controller);
    } on pkg.CameraException catch (error) {
      state = CaptureError(error.description ?? 'Could not start the camera.');
    }
  }

  /// Releases the camera. Called when the screen goes to background.
  Future<void> pause() async {
    await _disposeController();
    state = const CaptureCheckingPermission();
  }

  /// Re-opens the camera. Called when the screen returns to foreground.
  Future<void> resume() => _start();

  Future<void> _disposeController() async {
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      await controller.dispose();
    }
  }
}

/// Drives the capture screen's camera lifecycle and permission flow.
final cameraControllerProvider =
    NotifierProvider<CameraControllerNotifier, CaptureState>(
      CameraControllerNotifier.new,
    );
