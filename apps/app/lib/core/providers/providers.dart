import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/network/api_client.dart';
import 'package:fieldlens_app/core/network/token_storage.dart';
import 'package:fieldlens_app/core/providers/app_config.dart';
import 'package:fieldlens_app/features/auth/data/api_auth_repository.dart';
import 'package:fieldlens_app/features/auth/domain/auth_repository.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/capture/data/flutter_image_compressor.dart';
import 'package:fieldlens_app/features/capture/data/platform_metadata_gateway.dart';
import 'package:fieldlens_app/features/capture/data/platform_permission_gateway.dart';
import 'package:fieldlens_app/features/capture/domain/image_processor.dart';
import 'package:fieldlens_app/features/capture/domain/metadata_gateway.dart';
import 'package:fieldlens_app/features/capture/domain/permission_gateway.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/data/api_sync_remote.dart';
import 'package:fieldlens_app/features/sync/data/device_identity.dart';
import 'package:fieldlens_app/features/sync/data/platform_connectivity_gateway.dart';
import 'package:fieldlens_app/features/sync/data/sync_worker.dart';
import 'package:fieldlens_app/features/sync/domain/connectivity_gateway.dart';
import 'package:fieldlens_app/features/sync/domain/sync_remote.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Build-time configuration.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);

/// Reads/writes tokens in secure storage.
final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => const TokenStorage(),
);

/// The API client, which handles auth and network errors.
final apiClientProvider = Provider<ApiClient>((ref) {
  final config = ref.watch(appConfigProvider);
  return ApiClient(
    baseUrl: config.apiBaseUrl,
    tokenStorage: ref.watch(tokenStorageProvider),
    onSessionExpired: () =>
        ref.read(authProvider.notifier).handleSessionExpired(),
  );
});

/// The auth repository, backed by the real API.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => ApiAuthRepository(ref.watch(apiClientProvider)),
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

/// The app's local database. A single instance shared across the app.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

/// Queries and writes for inspections and their outbox entries.
final inspectionDaoProvider = Provider<InspectionDao>(
  (ref) => InspectionDao(ref.watch(appDatabaseProvider)),
);

/// Network reachability, used to trigger a sync on reconnect.
final connectivityGatewayProvider = Provider<ConnectivityGateway>(
  (ref) => PlatformConnectivityGateway(),
);

/// Talks to the server on behalf of the sync worker.
final syncRemoteProvider = Provider<SyncRemote>(
  (ref) => ApiSyncRemote(ref.watch(apiClientProvider)),
);

/// The server's id for this device.
final deviceIdentityProvider = Provider<DeviceIdentity>(
  (ref) => DeviceIdentity(
    dao: ref.watch(inspectionDaoProvider),
    remote: ref.watch(syncRemoteProvider),
  ),
);

/// Drains the outbox to the server.
final syncWorkerProvider = Provider<SyncWorker>(
  (ref) => SyncWorker(
    dao: ref.watch(inspectionDaoProvider),
    remote: ref.watch(syncRemoteProvider),
    identity: ref.watch(deviceIdentityProvider),
    connectivity: ref.watch(connectivityGatewayProvider),
  ),
);
