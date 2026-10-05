import 'dart:math';

const _baseDelay = Duration(seconds: 2);
const _maxDelay = Duration(minutes: 5);

// 2 seconds doubled this many times already passes the ceiling.
const _maxDoublings = 10;

/// How long to wait before retry number [attempt] (1 for the first retry).
///
/// Doubles each time up to a ceiling, then keeps a random half of the
/// delay so devices that failed together do not retry together.
Duration backoffDelay(int attempt, {Random? random}) {
  final doublings = min(max(attempt, 1) - 1, _maxDoublings);
  final uncapped = _baseDelay * (1 << doublings);
  final capped = uncapped > _maxDelay ? _maxDelay : uncapped;
  final half = capped.inMilliseconds ~/ 2;
  return Duration(milliseconds: half + (random ?? Random()).nextInt(half + 1));
}
