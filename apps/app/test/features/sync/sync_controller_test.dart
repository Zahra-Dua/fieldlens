import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/app_database.dart';
import 'package:fieldlens_app/core/providers/providers.dart';
import 'package:fieldlens_app/features/auth/presentation/auth_notifier.dart';
import 'package:fieldlens_app/features/history/data/inspection_dao.dart';
import 'package:fieldlens_app/features/sync/presentation/sync_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_connectivity_gateway.dart';
import '../../helpers/fake_sync_remote.dart';

class _SignedInAuth extends AuthNotifier {
  @override
  bool build() => true;
}

Future<void> _waitUntil(bool Function() condition) async {
  for (var i = 0; i < 150 && !condition(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase db;
  late InspectionDao dao;
  late FakeSyncRemote remote;
  late FakeConnectivityGateway connectivity;
  late ProviderContainer container;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    dao = InspectionDao(db);
    remote = FakeSyncRemote();
    connectivity = FakeConnectivityGateway(online: false);
    container = ProviderContainer(
      overrides: [
        authProvider.overrideWith(_SignedInAuth.new),
        inspectionDaoProvider.overrideWithValue(dao),
        syncRemoteProvider.overrideWithValue(remote),
        connectivityGatewayProvider.overrideWithValue(connectivity),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await connectivity.dispose();
    await db.close();
  });

  test('waits while offline, then syncs when the network returns', () async {
    await dao.createInspection(
      id: 'a',
      imagePath: '/tmp/a.jpg',
      capturedAt: DateTime(2026, 10, 3),
      deviceId: 'device',
    );

    container.read(syncControllerProvider);
    await _waitUntil(
      () => container.read(syncControllerProvider).lastReport != null,
    );
    expect(container.read(syncControllerProvider).lastReport!.offline, isTrue);
    expect(remote.pushed, isEmpty);

    connectivity.setOnline(value: true);
    await _waitUntil(
      () => container.read(syncControllerProvider).lastSyncedAt != null,
    );

    expect(remote.pushed.single, ['a']);
    expect(container.read(syncControllerProvider).lastSyncedAt, isNotNull);
  });
}
