import 'dart:async';

import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Debug-only button that calls a protected endpoint, so token refresh
/// can be demonstrated on a device. Renders nothing in release builds.
class DebugAuthCheckButton extends ConsumerWidget {
  /// Creates the button.
  const DebugAuthCheckButton({super.key});

  Future<void> _check(BuildContext context, WidgetRef ref) async {
    // Captured before the await so no BuildContext crosses the async gap.
    final messenger = ScaffoldMessenger.of(context);
    String result;
    try {
      final response = await ref
          .read(apiClientProvider)
          .dio
          .get<dynamic>('/auth/me');
      result = 'Protected request OK (${response.statusCode})';
    } on Object catch (error) {
      result = ApiClient.mapError(error).message;
    }
    messenger.showSnackBar(SnackBar(content: Text(result)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!kDebugMode) return const SizedBox.shrink();
    return IconButton(
      tooltip: 'Debug: check auth',
      icon: const Icon(Icons.bug_report),
      onPressed: () => unawaited(_check(context, ref)),
    );
  }
}
