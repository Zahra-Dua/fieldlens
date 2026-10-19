import 'dart:async';

import 'package:camera/camera.dart' as pkg;
import 'package:fieldlens_app/core/debug/debug_auth_check_button.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/capture/presentation/camera_controller_notifier.dart';
import 'package:fieldlens_app/features/capture/presentation/captured_photo_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

/// Live camera preview, with permission handling and lifecycle-aware
/// pause/resume. Capturing a photo, or choosing one from the gallery, pushes
/// [CapturedPhotoScreen] for preview/retake — this widget's own job is just
/// getting a live camera and a way to pick an existing image.
class CaptureScreen extends ConsumerStatefulWidget {
  /// Creates a [CaptureScreen].
  const new({super.key});

  @override
  ConsumerState<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends ConsumerState<CaptureScreen>
    with WidgetsBindingObserver {
  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final notifier = ref.read(cameraControllerProvider.notifier);
    switch (state) {
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        unawaited(notifier.pause());
      case AppLifecycleState.resumed:
        unawaited(notifier.resume());
      case AppLifecycleState.detached:
        break;
    }
  }

  Future<void> _capture(pkg.CameraController controller) async {
    if (!controller.value.isInitialized || controller.value.isTakingPicture) {
      return;
    }
    final file = await controller.takePicture();
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => CapturedPhotoScreen(imagePath: file.path),
      ),
    );
  }

  /// Lets the user pick an existing photo (a test image, for example).
  /// This needs no camera permission, so it also works on an emulator.
  Future<void> _pickFromGallery() async {
    try {
      final file = await _picker.pickImage(source: ImageSource.gallery);
      if (file == null || !mounted) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => CapturedPhotoScreen(imagePath: file.path),
        ),
      );
    } on PlatformException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open the gallery: ${error.message}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(cameraControllerProvider);
    final notifier = ref.read(cameraControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Capture'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => context.go(AppRoutes.history),
          ),
          const DebugAuthCheckButton(),
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'Settings',
            onPressed: () => context.go(AppRoutes.settings),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () =>
                unawaited(ref.read(authProvider.notifier).signOut()),
          ),
        ],
      ),
      body: switch (state) {
        CaptureCheckingPermission() => const Center(
          child: CircularProgressIndicator(),
        ),
        CaptureNeedsPermission() => _PermissionPrompt(
          message: 'FieldLens needs camera access to inspect items.',
          buttonLabel: 'Allow camera access',
          onPressed: notifier.requestPermission,
          onGallery: () => unawaited(_pickFromGallery()),
        ),
        CapturePermissionPermanentlyDenied() => _PermissionPrompt(
          message:
              'Camera access was denied. Enable it in Settings to '
              'continue.',
          buttonLabel: 'Open Settings',
          onPressed: notifier.openSettings,
          onGallery: () => unawaited(_pickFromGallery()),
        ),
        CaptureError(:final message) => _PermissionPrompt(
          message: message,
          buttonLabel: 'Try again',
          onPressed: notifier.resume,
          onGallery: () => unawaited(_pickFromGallery()),
        ),
        CaptureReady(:final controller) => Stack(
          fit: StackFit.expand,
          children: [
            pkg.CameraPreview(controller),
            Positioned(
              bottom: 32,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  IconButton.filledTonal(
                    tooltip: 'Choose from gallery',
                    iconSize: 32,
                    onPressed: () => unawaited(_pickFromGallery()),
                    icon: const Icon(Icons.photo_library),
                  ),
                  FloatingActionButton.large(
                    onPressed: () => unawaited(_capture(controller)),
                    child: const Icon(Icons.camera_alt),
                  ),
                  // Same width as the gallery button, so the shutter button
                  // stays in the middle.
                  const SizedBox(width: 48),
                ],
              ),
            ),
          ],
        ),
      },
    );
  }
}

class _PermissionPrompt extends StatelessWidget {
  const new({
    required this.message,
    required this.buttonLabel,
    required this.onPressed,
    required this.onGallery,
  });

  final String message;
  final String buttonLabel;
  final Future<void> Function() onPressed;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => unawaited(onPressed()),
              child: Text(buttonLabel),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onGallery,
              icon: const Icon(Icons.photo_library),
              label: const Text('Choose from gallery'),
            ),
          ],
        ),
      ),
    );
  }
}
