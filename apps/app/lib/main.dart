import 'package:fieldlens_app/app.dart';
import 'package:fieldlens_app/core/providers/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  AppConfig.fromEnvironment(); // fails fast if API_BASE_URL is missing
  runApp(const ProviderScope(child: FieldLensApp()));
}
