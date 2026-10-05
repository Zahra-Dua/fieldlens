/// Whether the device has a network interface up. This says nothing about
/// whether the API is reachable, so the sync worker still handles request
/// failures itself.
abstract interface class ConnectivityGateway {
  /// Whether any network interface is currently up.
  Future<bool> isOnline();

  /// Emits whenever the online state changes.
  Stream<bool> get onlineChanges;
}
