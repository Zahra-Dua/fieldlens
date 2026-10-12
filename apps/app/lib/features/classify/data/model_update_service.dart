import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/features/classify/data/model_metadata.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Downloads newer on-device models from the API (over-the-air) and keeps
/// track of which one is active.
///
/// A new model only becomes active after its size and SHA-256 are verified.
/// Any failure leaves the current model untouched.
class ModelUpdateService {
  /// Creates the service.
  ModelUpdateService({required this._apiClient, required this._preferences});
  static const _activeVersionKey = 'fieldlens.active_model_version';

  final ApiClient _apiClient;
  final SharedPreferences _preferences;
  bool _updating = false;

  /// Path of the downloaded active model, or null when the bundled model
  /// should be used.
  Future<String?> activeModelPath() async {
    final version = _preferences.getString(_activeVersionKey);
    if (version == null) return null;

    // Validate the stored value before using it in a file path.
    ModelMetadata.compareVersions(version, version);

    final supportDirectory = await getApplicationSupportDirectory();
    final file = File(
      p.join(supportDirectory.path, 'models', 'fieldlens_$version.tflite'),
    );
    return file.existsSync() ? file.path : null;
  }

  /// The version of the model in use: the downloaded one, or
  /// [bundledVersion] when there is none.
  Future<String> activeModelVersion(String bundledVersion) async {
    final path = await activeModelPath();
    if (path == null) return bundledVersion;
    return _preferences.getString(_activeVersionKey)!;
  }

  /// Checks the server for a newer model and installs it. Only one check
  /// runs at a time; a second call while one is running does nothing.
  Future<void> checkAndUpdate(String bundledVersion) async {
    if (_updating) return;
    _updating = true;
    try {
      await _checkAndUpdate(bundledVersion);
    } finally {
      _updating = false;
    }
  }

  Future<void> _checkAndUpdate(String bundledVersion) async {
    final platform = switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      _ => throw UnsupportedError(
        'Model updates are supported only on Android and iOS.',
      ),
    };

    final latestResponse = await _apiClient.dio.get<Object?>(
      '/models/latest',
      queryParameters: {'platform': platform},
    );
    final metadata = ModelMetadata.fromJson(latestResponse.data);
    final currentVersion = await activeModelVersion(bundledVersion);

    if (ModelMetadata.compareVersions(metadata.version, currentVersion) <= 0) {
      return;
    }

    final downloadResponse = await _apiClient.dio.get<List<int>>(
      '/models/${metadata.version}/download',
      options: Options(responseType: ResponseType.bytes),
    );
    final bytes = downloadResponse.data;
    if (bytes == null) {
      throw const FormatException('Model download returned no data.');
    }
    _verifyModel(bytes, metadata);

    final supportDirectory = await getApplicationSupportDirectory();
    final modelsDirectory = Directory(p.join(supportDirectory.path, 'models'));
    await modelsDirectory.create(recursive: true);

    final modelFile = File(
      p.join(modelsDirectory.path, 'fieldlens_${metadata.version}.tflite'),
    );
    final temporaryFile = File('${modelFile.path}.part');

    try {
      if (temporaryFile.existsSync()) {
        await temporaryFile.delete();
      }
      await temporaryFile.writeAsBytes(bytes, flush: true);

      // Verify the staged file too; only then promote it to its final name.
      _verifyModel(await temporaryFile.readAsBytes(), metadata);

      if (modelFile.existsSync()) {
        await modelFile.delete();
      }
      await temporaryFile.rename(modelFile.path);

      final saved = await _preferences.setString(
        _activeVersionKey,
        metadata.version,
      );
      if (!saved) {
        throw StateError('Could not save the active model version.');
      }
      await _deleteOldModels(modelsDirectory, keep: modelFile.path);
    } finally {
      if (temporaryFile.existsSync()) {
        await temporaryFile.delete();
      }
    }
  }

  void _verifyModel(List<int> bytes, ModelMetadata metadata) {
    if (bytes.length != metadata.sizeBytes) {
      throw FormatException(
        'Downloaded model size mismatch: '
        'expected ${metadata.sizeBytes}, got ${bytes.length}.',
      );
    }

    final actualSha256 = sha256.convert(bytes).toString();
    if (actualSha256 != metadata.sha256) {
      throw const FormatException('Downloaded model SHA-256 mismatch.');
    }
  }

  /// Removes model files from earlier updates. Runs only after the new
  /// version is active, so a failure here can never hurt the active model.
  Future<void> _deleteOldModels(
    Directory directory, {
    required String keep,
  }) async {
    await for (final entity in directory.list()) {
      if (entity is File &&
          entity.path != keep &&
          p.extension(entity.path) == '.tflite') {
        try {
          await entity.delete();
        } on FileSystemException catch (error) {
          debugPrint('Could not delete old model ${entity.path}: $error');
        }
      }
    }
  }
}
