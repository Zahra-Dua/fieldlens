/// What the server says about a published model version: its version number,
/// file size and SHA-256 checksum.
class ModelMetadata {
  /// Creates metadata from already-validated values.
  const ModelMetadata({
    required this.version,
    required this.sizeBytes,
    required this.sha256,
  });

  /// Reads the JSON from `GET /models/latest` and rejects anything invalid.
  factory ModelMetadata.fromJson(Object? json) {
    if (json is! Map<String, dynamic>) {
      throw const FormatException('Invalid model metadata: expected an object');
    }

    final version = json['version'];
    final sizeBytes = json['size_bytes'];
    final sha256 = json['sha256'];

    if (version is! String || !_versionPattern.hasMatch(version)) {
      throw const FormatException('Invalid model metadata version');
    }
    if (sizeBytes is! int || sizeBytes <= 0) {
      throw const FormatException('Invalid model metadata size');
    }
    if (sha256 is! String || !_sha256Pattern.hasMatch(sha256)) {
      throw const FormatException('Invalid model metadata SHA-256');
    }

    return ModelMetadata(
      version: version,
      sizeBytes: sizeBytes,
      sha256: sha256,
    );
  }

  static final _versionPattern = RegExp(
    r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$',
  );
  static final _sha256Pattern = RegExp(r'^[a-f0-9]{64}$');

  /// Model version, three numbers such as `1.2.1`.
  final String version;

  /// Size of the model file in bytes.
  final int sizeBytes;

  /// Lower-case hex SHA-256 of the model file.
  final String sha256;

  /// Compares two versions as numbers (so 1.10.0 is newer than 1.9.0).
  ///
  /// Returns a negative number, zero or a positive number when [first] is
  /// older than, equal to, or newer than [second].
  static int compareVersions(String first, String second) {
    if (!_versionPattern.hasMatch(first) || !_versionPattern.hasMatch(second)) {
      throw FormatException('Invalid model version: $first or $second');
    }

    final firstParts = first.split('.').map(int.parse).toList();
    final secondParts = second.split('.').map(int.parse).toList();

    for (var i = 0; i < firstParts.length; i++) {
      final comparison = firstParts[i].compareTo(secondParts[i]);
      if (comparison != 0) return comparison;
    }

    return 0;
  }
}
