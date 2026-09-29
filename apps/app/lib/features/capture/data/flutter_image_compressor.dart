import 'package:fieldlens_app/features/capture/domain/image_processor.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

/// Documented ceiling: images are resized to fit within 1280px on the
/// longest side and compressed at 80% JPEG quality. On typical inspection
/// photos this lands well under 500 KB — see docs/adr for the number.
class FlutterImageCompressor implements ImageProcessor {
  static const _maxDimension = 1280;
  static const _quality = 80;

  @override
  Future<String> compress(String sourcePath) async {
    final targetPath = '$sourcePath-compressed.jpg';
    final result = await FlutterImageCompress.compressAndGetFile(
      sourcePath,
      targetPath,
      minWidth: _maxDimension,
      minHeight: _maxDimension,
      quality: _quality,
    );
    return result?.path ?? sourcePath;
  }
}
