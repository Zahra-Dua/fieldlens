import 'package:fieldlens_app/features/classify/data/model_metadata.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final valid = <String, dynamic>{
    'version': '1.1.0',
    'size_bytes': 1024,
    'sha256': 'a' * 64,
  };

  group('ModelMetadata.fromJson', () {
    test('reads a valid response', () {
      final metadata = ModelMetadata.fromJson(valid);
      expect(metadata.version, '1.1.0');
      expect(metadata.sizeBytes, 1024);
      expect(metadata.sha256, 'a' * 64);
    });

    test('rejects a response that is not an object', () {
      expect(() => ModelMetadata.fromJson('nope'), throwsFormatException);
    });

    test('rejects a bad version', () {
      expect(
        () => ModelMetadata.fromJson({...valid, 'version': '1.1'}),
        throwsFormatException,
      );
    });

    test('rejects a size of zero', () {
      expect(
        () => ModelMetadata.fromJson({...valid, 'size_bytes': 0}),
        throwsFormatException,
      );
    });

    test('rejects a short or upper-case checksum', () {
      expect(
        () => ModelMetadata.fromJson({...valid, 'sha256': 'abc'}),
        throwsFormatException,
      );
      expect(
        () => ModelMetadata.fromJson({...valid, 'sha256': 'A' * 64}),
        throwsFormatException,
      );
    });
  });

  group('ModelMetadata.compareVersions', () {
    test('compares numbers, not text', () {
      expect(ModelMetadata.compareVersions('1.10.0', '1.9.0'), greaterThan(0));
    });

    test('equal and older versions', () {
      expect(ModelMetadata.compareVersions('1.1.0', '1.1.0'), 0);
      expect(ModelMetadata.compareVersions('1.0.0', '1.1.0'), lessThan(0));
    });

    test('rejects an invalid version', () {
      expect(
        () => ModelMetadata.compareVersions('1.x.0', '1.0.0'),
        throwsFormatException,
      );
    });
  });
}
