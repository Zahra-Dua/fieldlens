/// Errors the UI actually needs to distinguish, mapped from whatever Dio
/// throws. A screen should never have to inspect a DioException directly.
sealed class NetworkException implements Exception {
  const NetworkException(this.message);

  /// User-facing message.
  final String message;
}

/// No network reachable, or the request timed out.
class NoConnectionException extends NetworkException {
  /// Creates a new exception with a user-facing message.
  const NoConnectionException()
    : super('No connection. Check your network and try again.');
}

/// 401 after a refresh attempt also failed — the session is over.
class SessionExpiredException extends NetworkException {
  /// Creates a new exception with a user-facing message.
  const SessionExpiredException()
    : super('Your session has expired. Please log in again.');
}

/// 400/422-class validation or business-rule rejection from the API, with
/// the server's own message passed through.
class ApiRejectedException extends NetworkException {
  /// Creates a new exception with a user-facing message.
  const ApiRejectedException(super.message);
}

/// Anything else — 5xx, unexpected shape, etc.
class UnknownNetworkException extends NetworkException {
  /// Creates a new exception with a user-facing message.
  const UnknownNetworkException()
    : super('Something went wrong. Please try again.');
}

/// Login rejected: wrong email or password.
class InvalidCredentialsException extends NetworkException {
  /// Creates a new exception with a user-facing message.
  const InvalidCredentialsException() : super('Wrong email or password.');
}
