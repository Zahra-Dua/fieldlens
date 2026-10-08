import 'dart:io';

import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';
import 'package:path/path.dart' as p;

/// [SyncRemote] backed by the FieldLens API.
class ApiSyncRemote implements SyncRemote {
  /// Creates the remote over an authenticated [ApiClient].
  ApiSyncRemote(this._client);

  final ApiClient _client;

  @override
  Future<String> registerDevice({required String deviceUuid}) async {
    try {
      final response = await _client.dio.post<Map<String, dynamic>>(
        '/devices/register',
        data: {
          'deviceUuid': deviceUuid,
          'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
        },
      );
      return response.data!['id'] as String;
    } catch (error) {
      throw ApiClient.mapError(error);
    }
  }

  @override
  Future<void> pushInspections(List<InspectionUpload> uploads) async {
    try {
      await _client.dio.post<void>(
        '/inspections',
        data: {'inspections': uploads.map(_toJson).toList()},
      );
    } catch (error) {
      throw ApiClient.mapError(error);
    }
  }

  // The API rejects null for optional fields, so they are left out.
  Map<String, Object> _toJson(InspectionUpload upload) => {
    'id': upload.id,
    'deviceId': upload.serverDeviceId,
    'capturedAt': upload.capturedAt.toUtc().toIso8601String(),
    if (upload.latitude != null) 'latitude': upload.latitude!,
    if (upload.longitude != null) 'longitude': upload.longitude!,
    if (upload.predictedClass != null) 'predictedClass': upload.predictedClass!,
    if (upload.confidence != null) 'confidence': upload.confidence!,
    if (upload.predictedClass != null) 'inferenceSource': 'ON_DEVICE',
    if (upload.correctedClass != null) 'correctedClass': upload.correctedClass!,
    if (upload.isAccepted != null) 'isAccepted': upload.isAccepted!,
  };

  @override
  Future<void> uploadImage({
    required String inspectionId,
    required String imagePath,
  }) async {
    if (!File(imagePath).existsSync()) {
      throw const ApiRejectedException(
        'The photo file is missing on this device.',
      );
    }
    try {
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(
          imagePath,
          filename: p.basename(imagePath),
          // The API only accepts image types, and Day 7 stores JPEG.
          contentType: DioMediaType('image', 'jpeg'),
        ),
      });
      await _client.dio.post<void>(
        '/inspections/$inspectionId/images',
        data: form,
      );
    } catch (error) {
      throw ApiClient.mapError(error);
    }
  }
}
