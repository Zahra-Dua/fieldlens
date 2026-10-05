import 'dart:math';

import 'package:fieldlens_app/features/sync/domain/backoff.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('delay doubles per attempt inside the jitter window', () {
    final random = Random(42);
    for (var attempt = 1; attempt <= 4; attempt++) {
      final full = Duration(seconds: 2 * (1 << (attempt - 1)));
      final delay = backoffDelay(attempt, random: random);

      expect(delay, greaterThanOrEqualTo(full ~/ 2));
      expect(delay, lessThanOrEqualTo(full));
    }
  });

  test('delay never passes the five minute ceiling', () {
    final random = Random(42);
    for (final attempt in [8, 10, 50, 1000]) {
      expect(
        backoffDelay(attempt, random: random),
        lessThanOrEqualTo(const Duration(minutes: 5)),
      );
    }
  });

  test('jitter spreads devices apart', () {
    final delays = {
      for (var seed = 0; seed < 20; seed++)
        backoffDelay(5, random: Random(seed)),
    };

    expect(delays.length, greaterThan(1));
  });
}
