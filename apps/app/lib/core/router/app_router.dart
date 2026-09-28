import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/auth/presentation/login_screen.dart';
import 'package:fieldlens_app/features/capture/presentation/capture_screen.dart';
import 'package:fieldlens_app/features/history/presentation/history_screen.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// App router with an auth-guarded redirect.
final routerProvider = Provider<GoRouter>((ref) {
  // Re-evaluate redirects whenever auth state changes.
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(authProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: AppRoutes.capture,
    refreshListenable: refresh,
    redirect: (context, state) {
      final signedIn = ref.read(authProvider);
      final atLogin = state.matchedLocation == AppRoutes.login;
      if (!signedIn && !atLogin) return AppRoutes.login;
      if (signedIn && atLogin) return AppRoutes.capture;
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: AppRoutes.capture,
        builder: (_, _) => const CaptureScreen(),
      ),
      GoRoute(
        path: AppRoutes.history,
        builder: (_, _) => const HistoryScreen(),
      ),
    ],
  );
});
