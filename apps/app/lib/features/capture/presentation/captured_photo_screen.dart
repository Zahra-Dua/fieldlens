import 'dart:async';
import 'dart:io';

import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/capture/domain/inspection_metadata.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

/// Shows a just-captured photo. Retake discards it; "Use photo" compresses
/// it and attaches metadata. Saving to the local DB is wired on Day 8 —
/// today this screen only proves compression and metadata capture work.
class CapturedPhotoScreen extends ConsumerStatefulWidget {
  /// Creates the screen for the photo at [imagePath].
  const CapturedPhotoScreen({required this.imagePath, super.key});

  /// Path to the raw, uncompressed photo.
  final String imagePath;

  @override
  ConsumerState<CapturedPhotoScreen> createState() =>
      _CapturedPhotoScreenState();
}

class _CapturedPhotoScreenState extends ConsumerState<CapturedPhotoScreen> {
  bool _saving = false;

  Future<void> _usePhoto() async {
    setState(() => _saving = true);

    final compressedPath = await ref
        .read(imageProcessorProvider)
        .compress(widget.imagePath);
    final metadata = await _buildMetadata();

    await ref
        .read(inspectionDaoProvider)
        .createInspection(
          id: const Uuid().v4(),
          imagePath: compressedPath,
          capturedAt: metadata.capturedAt,
          deviceId: metadata.deviceId,
          latitude: metadata.latitude,
          longitude: metadata.longitude,
        );

    // The inspection is already in the outbox, so a sync is worth starting
    // whether or not this screen is still showing.
    unawaited(ref.read(syncControllerProvider.notifier).syncNow());

    if (!mounted) return;
    setState(() => _saving = false);

    if (!context.mounted) return;
    context.go(AppRoutes.history);
  }

  Future<InspectionMetadata> _buildMetadata() async {
    final permissions = ref.read(permissionGatewayProvider);
    final metadataGateway = ref.read(metadataGatewayProvider);

    final deviceId = await metadataGateway.deviceId();

    final locationOutcome = await permissions.status(AppPermission.location);
    final granted =
        locationOutcome == PermissionOutcome.granted ||
        await permissions.request(AppPermission.location) ==
            PermissionOutcome.granted;

    final position = granted ? await metadataGateway.currentLocation() : null;

    return InspectionMetadata(
      capturedAt: DateTime.now(),
      deviceId: deviceId,
      latitude: position?.latitude,
      longitude: position?.longitude,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review')),
      body: Column(
        children: [
          Expanded(
            child: Image.file(File(widget.imagePath), fit: BoxFit.contain),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                OutlinedButton.icon(
                  onPressed: _saving ? null : () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retake'),
                ),
                FilledButton.icon(
                  onPressed: _saving ? null : () => unawaited(_usePhoto()),
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: const Text('Use photo'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
