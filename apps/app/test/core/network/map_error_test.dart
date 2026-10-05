import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _badResponse(int status) {
  final options = RequestOptions(path: '/inspections');
  return DioException(
    requestOptions: options,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(requestOptions: options, statusCode: status),
  );
}

void main() {
  test('400 is a permanent rejection that carries its status', () {
    final result = ApiClient.mapError(_badResponse(400));

    expect(result, isA<ApiRejectedException>());
    expect((result as ApiRejectedException).statusCode, 400);
  });

  test('413 is permanent, the file will never get smaller on retry', () {
    expect(ApiClient.mapError(_badResponse(413)), isA<ApiRejectedException>());
  });

  test('5xx, 408 and 429 are temporary', () {
    for (final status in [500, 503, 408, 429]) {
      expect(
        ApiClient.mapError(_badResponse(status)),
        isA<ServerUnavailableException>(),
        reason: 'status $status',
      );
    }
  });

  test('401 means the session is over', () {
    expect(
      ApiClient.mapError(_badResponse(401)),
      isA<SessionExpiredException>(),
    );
  });

  test('a timeout is a connection problem', () {
    final error = DioException(
      requestOptions: RequestOptions(path: '/inspections'),
      type: DioExceptionType.connectionTimeout,
    );

    expect(ApiClient.mapError(error), isA<NoConnectionException>());
  });
}
