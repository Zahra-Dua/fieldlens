import 'package:dio/dio.dart';
import 'package:fieldlens_app/core/network/network_exception.dart';
import 'package:fieldlens_app/core/network/token_storage.dart';
import 'package:fieldlens_app/features/auth/domain/auth_tokens.dart';

/// Dio instance wired with auth headers and refresh-on-401. Everything
/// else in the app should go through this, never a bare Dio().
class ApiClient {
  /// Creates the client against [baseUrl], persisting tokens in
  /// [tokenStorage]. [onSessionExpired] runs after a refresh is rejected
  /// and the tokens have been cleared, so the app can show the login.
  ApiClient({
    required String baseUrl,
    required this.tokenStorage,
    this.onSessionExpired,
  }) : dio = Dio(
         BaseOptions(
           baseUrl: baseUrl,
           connectTimeout: _connectTimeout,
           receiveTimeout: _receiveTimeout,
         ),
       ) {
    dio.interceptors.add(
      InterceptorsWrapper(onRequest: _attachToken, onError: _handleError),
    );
  }

  static const _connectTimeout = Duration(seconds: 10);
  static const _receiveTimeout = Duration(seconds: 30);
  static const _retriedKey = 'authRetried';

  // A 401 on these means bad credentials, not an expired access token.
  static const _noRefreshPaths = {
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/logout',
  };

  // Only a server rejection means the session is over. Network errors
  // propagate as DioException so the caller keeps its tokens.
  static const _rejectedStatuses = {400, 401, 403};

  /// The underlying Dio instance, for building typed repositories.
  final Dio dio;

  /// Persists tokens across the refresh cycle.
  final TokenStorage tokenStorage;

  /// Called once the session is unrecoverable (refresh rejected).
  final void Function()? onSessionExpired;

  // Coalesces concurrent 401s: the first one calls /auth/refresh, the rest
  // await the same in-flight Future (the "no refresh storm" requirement).
  Future<void>? _refreshing;

  Future<void> _attachToken(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await tokenStorage.readAccessToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  Future<void> _handleError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final request = error.requestOptions;
    // A multipart body can only be sent once, so the retry needs a copy.
    final body = request.data;
    if (body is FormData) request.data = body.clone();
    final canRefresh =
        error.response?.statusCode == 401 &&
        !_noRefreshPaths.contains(request.path) &&
        request.extra[_retriedKey] != true;
    if (!canRefresh) {
      handler.next(error);
      return;
    }

    try {
      await _refreshIfStale(request);
    } on SessionExpiredException {
      await tokenStorage.clear();
      onSessionExpired?.call();
      handler.next(error);
      return;
    } on DioException catch (refreshError) {
      // Offline or server down: keep the tokens, the user is still signed in.
      handler.next(refreshError);
      return;
    }

    // Retry once. The flag stops a second 401 from refreshing again.
    request.extra[_retriedKey] = true;
    try {
      handler.resolve(await dio.fetch<dynamic>(request));
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<void> _refreshIfStale(RequestOptions failed) async {
    final current = await tokenStorage.readAccessToken();
    final usedCurrent = failed.headers['Authorization'] == 'Bearer $current';
    // Another request already refreshed while this one was in flight.
    if (current != null && !usedCurrent) return;

    await (_refreshing ??= _doRefresh().whenComplete(() {
      _refreshing = null;
    }));
  }

  Future<void> _doRefresh() async {
    final refreshToken = await tokenStorage.readRefreshToken();
    if (refreshToken == null) throw const SessionExpiredException();

    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final tokens = AuthTokens.fromJson(response.data!);
      await tokenStorage.save(
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      );
    } on DioException catch (e) {
      if (_rejectedStatuses.contains(e.response?.statusCode)) {
        throw const SessionExpiredException();
      }
      rethrow;
    }
  }

  /// Maps any thrown error to a [NetworkException] the UI can display
  /// directly. Call this from repository methods' catch blocks.
  static NetworkException mapError(Object error) {
    if (error is NetworkException) return error;
    if (error is! DioException) return const UnknownNetworkException();

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.connectionError:
        return const NoConnectionException();
      case DioExceptionType.badResponse:
        final status = error.response?.statusCode;
        if (status == 401) return const SessionExpiredException();
        if (status != null && _isTemporaryStatus(status)) {
          return const ServerUnavailableException();
        }
        if (status != null && status >= 400 && status < 500) {
          return ApiRejectedException(
            _extractMessage(error.response?.data),
            statusCode: status,
          );
        }
        return const UnknownNetworkException();
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.transformTimeout:
      case DioExceptionType.unknown:
        return const UnknownNetworkException();
    }
  }

  // Retrying later can fix these, unlike the rest of the 4xx range.
  static bool _isTemporaryStatus(int status) =>
      status >= 500 || status == 408 || status == 429;

  static String _extractMessage(Object? body) {
    if (body is Map<String, dynamic>) {
      final error = body['error'];
      if (error is Map<String, dynamic>) {
        final message = error['message'];
        if (message is String) return message;
      }
    }
    return 'Request rejected.';
  }
}
