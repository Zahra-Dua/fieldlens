import 'dart:async';

import 'package:fieldlens_app/features/sync/domain/connectivity_gateway.dart';

/// Test double whose online state is set by hand.
class FakeConnectivityGateway implements ConnectivityGateway {
  /// Creates the fake, starting online unless told otherwise.
  FakeConnectivityGateway({this.online = true});

  /// Whether the fake currently reports a network.
  bool online;

  final _controller = StreamController<bool>.broadcast();

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onlineChanges => _controller.stream;

  /// Changes the state and notifies listeners.
  void setOnline({required bool value}) {
    online = value;
    _controller.add(value);
  }

  /// Closes the underlying stream.
  Future<void> dispose() => _controller.close();
}
