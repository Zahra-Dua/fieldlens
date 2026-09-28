import 'package:fieldlens_app/core/router/app_routes.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Placeholder history screen. Local inspections arrive on Day 8.
class HistoryScreen extends StatelessWidget {
  /// Creates a [HistoryScreen].
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('History'),
        leading: BackButton(onPressed: () => context.go(AppRoutes.capture)),
      ),
      body: const Center(child: Text('Local inspections come on Day 8')),
    );
  }
}
