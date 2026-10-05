import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:fieldlens_app/features/sync/domain/connectivity_gateway.dart';

/// [ConnectivityGateway] backed by connectivity_plus.
class PlatformConnectivityGateway implements ConnectivityGateway {
  /// Creates the gateway, optionally with a custom [Connectivity].
  PlatformConnectivityGateway([Connectivity? connectivity])
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  static bool _hasNetwork(List<ConnectivityResult> results) =>
      results.any((result) => result != ConnectivityResult.none);

  @override
  Future<bool> isOnline() async =>
      _hasNetwork(await _connectivity.checkConnectivity());

  @override
  Stream<bool> get onlineChanges =>
      _connectivity.onConnectivityChanged.map(_hasNetwork).distinct();
}
