import 'package:fieldlens_app/core/providers/app_config.dart';
import 'package:fieldlens_app/features/auth/data/fake_auth_repository.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:fieldlens_app/features/capture/data/flutter_image_compressor.dart';
import 'package:fieldlens_app/features/capture/data/platform_metadata_gateway.dart';
import 'package:fieldlens_app/features/capture/data/platform_permission_gateway.dart';
import 'package:fieldlens_app/features/capture/domain/image_processor.dart';
import 'package:fieldlens_app/features/capture/domain/metadata_gateway.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Build-time configuration.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// The auth repository. Swap the implementation here, or override it in tests.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => FakeAuthRepository(),
);

/// OS permission access. Override with a fake in tests.
final permissionGatewayProvider = Provider<PermissionGateway>(
  (ref) => PlatformPermissionGateway(),
);

/// OS metadata access. Override with a fake in tests.
final metadataGatewayProvider = Provider<MetadataGateway>(
  (ref) => PlatformMetadataGateway(),
);

/// Compresses captured photos before storage.
final imageProcessorProvider = Provider<ImageProcessor>(
  (ref) => FlutterImageCompressor(),
);
