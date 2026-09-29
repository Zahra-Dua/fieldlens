/// Compresses a captured photo before it is stored, so the sync budget
/// (Day 10) is not destroyed by full-resolution images.
abstract interface class ImageProcessor {
  /// Resizes and compresses the image at [sourcePath], writing the result
  /// next to it, and returns the new path.
  Future<String> compress(String sourcePath);
}
