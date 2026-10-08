import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/features/sync/data/api_sync_remote.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_token_storage.dart';

class _CapturingAdapter implements HttpClientAdapter {
  RequestOptions? last;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    last = options;
    return ResponseBody.fromString(
      '{}',
      201,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _CapturingAdapter adapter;
  late ApiSyncRemote remote;

  setUp(() {
    adapter = _CapturingAdapter();
    final client = ApiClient(
      baseUrl: 'http://test',
      tokenStorage: FakeTokenStorage(),
    );
    client.dio.httpClientAdapter = adapter;
    remote = ApiSyncRemote(client);
  });

  Map<String, dynamic> sentItem() {
    final body = adapter.last!.data as Map<String, dynamic>;
    final items = body['inspections'] as List<dynamic>;
    return items.single as Map<String, dynamic>;
  }

  test('a missing GPS fix is left out, not sent as null', () async {
    await remote.pushInspections([
      InspectionUpload(
        id: 'a',
        serverDeviceId: 'server-device',
        capturedAt: DateTime.utc(2026, 10, 3),
      ),
    ]);

    final item = sentItem();
    expect(item.containsKey('latitude'), isFalse);
    expect(item.containsKey('longitude'), isFalse);
    expect(item['deviceId'], 'server-device');
  });

  test('prediction and correction are sent when present', () async {
    await remote.pushInspections([
      InspectionUpload(
        id: 'a',
        serverDeviceId: 'server-device',
        capturedAt: DateTime.utc(2026, 10, 3),
        latitude: 33.6,
        longitude: 73,
        predictedClass: 'PLASTIC',
        confidence: 0.82,
        correctedClass: 'GLASS',
        isAccepted: false,
      ),
    ]);

    final item = sentItem();
    expect(item['latitude'], 33.6);
    expect(item['predictedClass'], 'PLASTIC');
    expect(item['confidence'], 0.82);
    expect(item['inferenceSource'], 'ON_DEVICE');
    expect(item['correctedClass'], 'GLASS');
    expect(item['isAccepted'], isFalse);
  });

  test('legacy inspection omits unavailable prediction fields', () async {
    await remote.pushInspections([
      InspectionUpload(
        id: 'a',
        serverDeviceId: 'server-device',
        capturedAt: DateTime.utc(2026, 10, 3),
      ),
    ]);

    final item = sentItem();
    expect(item.containsKey('predictedClass'), isFalse);
    expect(item.containsKey('confidence'), isFalse);
    expect(item.containsKey('inferenceSource'), isFalse);
  });
}
