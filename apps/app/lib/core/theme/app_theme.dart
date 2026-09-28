import 'package:flutter/material.dart';

/// Single source of colour and typography tokens. Widgets read from
/// `Theme.of(context)`, never from raw [Color] values.
abstract final class AppTheme {
  static const _seed = Color(0xFF2E7D32);

  /// Light theme.
  static ThemeData get light => _build(Brightness.light);

  /// Dark theme.
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _seed,
        brightness: brightness,
      ),
      textTheme: const TextTheme(
        headlineMedium: TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }
}
