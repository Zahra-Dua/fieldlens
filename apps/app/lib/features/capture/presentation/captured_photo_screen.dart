import 'dart:async';
import 'dart:io';

import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/capture/domain/inspection_metadata.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shows a just-captured photo. Retake discards it; "Use photo" compresses
/// it and attaches metadata. Saving to the local DB is wired on Day 8 —
/// today this screen only proves compression and metadata capture work.
class CapturedPhotoScreen extends ConsumerStatefulWidget {
  /// Creates the screen for the photo at [imagePath].
  // The class name is required here even though the lint below flags it —
  // this is a constructor declaration, not a call site, and Dart gives no
  // way to name a constructor without repeating the class name.
  // ignore: unnecessary_type_name_in_constructor
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

    if (!mounted) return;
    setState(() => _saving = false);

    final compressedSize = await File(compressedPath).length();
    // Day 8 replaces this with a real save to the outbox.
    if (!context.mounted) return;
    await showDialog<void>(
      // Guarded immediately above with context.mounted; the analyzer
      // still flags this because of the earlier State.mounted check
      // further up, but the actual context use here is correctly guarded.
      // ignore: use_build_context_synchronously
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Captured'),
        content: Text(
          'Compressed size: ${(compressedSize / 1024).toStringAsFixed(0)} KB\n'
          'Captured at: ${metadata.capturedAt}\n'
          'Device: ${metadata.deviceId}\n'
          'Location: ${metadata.latitude ?? "unavailable"}, '
          '${metadata.longitude ?? "unavailable"}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (!context.mounted) return;
    Navigator.of(context).pop();
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
