import 'dart:async';
import 'dart:io';

import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/capture/domain/inspection_metadata.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:fieldlens_app/features/classify/data/tflite_classifier.dart';
import 'package:fieldlens_app/features/classify/domain/classification.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

/// Shows a just-captured photo, its on-device prediction, and a correction
/// control before the inspection is saved locally.
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
  String? _processedImagePath;
  Classification? _classification;
  String? _selectedClass;
  Object? _processingError;
  bool _processing = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    unawaited(_analyzePhoto());
  }

  Future<void> _analyzePhoto() async {
    setState(() {
      _processing = true;
      _processingError = null;
    });
    try {
      final photoBytes = await File(widget.imagePath).readAsBytes();
      final classification = await TfliteClassifier.classifyInBackground(
        photoBytes,
      );
      final imagePath = await ref
          .read(imageProcessorProvider)
          .compress(widget.imagePath);
      if (!mounted) return;
      setState(() {
        _processedImagePath = imagePath;
        _classification = classification;
        _selectedClass = classification.confidence < kConfidenceThreshold
            ? null
            : classification.label;
        _processing = false;
      });
    } on Object catch (error, stackTrace) {
      debugPrint('Could not classify captured photo: $error');
      debugPrintStack(stackTrace: stackTrace);
      if (!mounted) return;
      setState(() {
        _processingError = error;
        _processing = false;
      });
    }
  }

  Future<void> _usePhoto() async {
    final classification = _classification;
    final selectedClass = _selectedClass;
    final imagePath = _processedImagePath;
    if (classification == null || selectedClass == null || imagePath == null) {
      return;
    }
    setState(() => _saving = true);

    try {
      final metadata = await _buildMetadata();

      await ref
          .read(inspectionDaoProvider)
          .createInspection(
            id: const Uuid().v4(),
            imagePath: imagePath,
            capturedAt: metadata.capturedAt,
            deviceId: metadata.deviceId,
            latitude: metadata.latitude,
            longitude: metadata.longitude,
            predictedClass: classification.label,
            confidence: classification.confidence,
            isUncertain: classification.confidence < kConfidenceThreshold,
            correctedClass: selectedClass == classification.label
                ? null
                : selectedClass,
            isAccepted: selectedClass == classification.label,
          );

      // The inspection is already in the outbox, so a sync is worth starting
      // whether or not this screen is still showing.
      unawaited(ref.read(syncControllerProvider.notifier).syncNow());

      if (!mounted) return;
      setState(() => _saving = false);

      if (!context.mounted) return;
      context.go(AppRoutes.history);
    } on Object catch (error, stackTrace) {
      debugPrint('Could not save inspection: $error');
      debugPrintStack(stackTrace: stackTrace);
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save inspection: $error')),
      );
    }
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
            child: Image.file(
              File(_processedImagePath ?? widget.imagePath),
              fit: BoxFit.contain,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _classificationPanel(),
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
                  onPressed:
                      _saving ||
                          _processing ||
                          _classification == null ||
                          _selectedClass == null
                      ? null
                      : () => unawaited(_usePhoto()),
                  icon: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: const Text('Save inspection'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _classificationPanel() {
    if (_processing) {
      return const Column(
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 8),
          Text('Analyzing on this device...'),
        ],
      );
    }

    final error = _processingError;
    if (error != null) {
      return Column(
        children: [
          Text('Could not analyze this photo: $error'),
          TextButton(
            onPressed: () => unawaited(_analyzePhoto()),
            child: const Text('Try again'),
          ),
        ],
      );
    }

    final result = _classification;
    if (result == null) return const SizedBox.shrink();
    final uncertain = result.confidence < kConfidenceThreshold;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          uncertain
              ? 'Uncertain result — choose the correct label'
              : 'Prediction: ${result.label} '
                    '(${(result.confidence * 100).toStringAsFixed(1)}%)',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        if (uncertain)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text('Low confidence. Please confirm or correct the label.'),
          ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _selectedClass,
          decoration: const InputDecoration(
            labelText: 'Confirm or correct label',
            border: OutlineInputBorder(),
          ),
          items: [
            for (final label in kClassLabels)
              DropdownMenuItem(value: label, child: Text(label)),
          ],
          onChanged: (value) => setState(() => _selectedClass = value),
        ),
      ],
    );
  }
}
