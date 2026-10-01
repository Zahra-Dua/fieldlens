import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_token_storage.dart';

ResponseBody _json(Map<String, dynamic> body, int status) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

class _FakeAdapter implements HttpClientAdapter {
  int refreshCalls = 0;
  bool refreshOffline = false;
  int refreshStatus = 200;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path == '/auth/refresh') {
      refreshCalls++;
      await Future<void>.delayed(const Duration(milliseconds: 20));
      if (refreshOffline) {
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.connectionError,
        );
      }
      return _json({'accessToken': 'new', 'refreshToken': 'r2'}, refreshStatus);
    }
    final ok = options.headers['Authorization'] == 'Bearer new';
    return _json({'ok': ok}, ok ? 200 : 401);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late FakeTokenStorage storage;
  late _FakeAdapter adapter;
  late ApiClient client;
  var expired = false;

  setUp(() {
    expired = false;
    storage = FakeTokenStorage()
      ..accessToken = 'old'
      ..refreshToken = 'r1';
    adapter = _FakeAdapter();
    client = ApiClient(
      baseUrl: 'http://test',
      tokenStorage: storage,
      onSessionExpired: () => expired = true,
    );
    client.dio.httpClientAdapter = adapter;
  });

  test('concurrent 401s trigger exactly one refresh', () async {
    final responses = await Future.wait([
      for (var i = 0; i < 3; i++) client.dio.get<dynamic>('/inspections'),
    ]);

    expect(adapter.refreshCalls, 1);
    expect(responses.every((r) => r.statusCode == 200), isTrue);
  });

  test('offline during refresh keeps the tokens', () async {
    adapter.refreshOffline = true;

    await expectLater(
      client.dio.get<dynamic>('/inspections'),
      throwsA(isA<DioException>()),
    );

    expect(storage.refreshToken, 'r1');
    expect(expired, isFalse);
  });

  test('rejected refresh clears tokens and signals logout', () async {
    adapter.refreshStatus = 401;

    await expectLater(
      client.dio.get<dynamic>('/inspections'),
      throwsA(isA<DioException>()),
    );

    expect(storage.accessToken, isNull);
    expect(expired, isTrue);
  });
}
