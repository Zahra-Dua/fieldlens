import 'dart:typed_data';

import 'package:fieldlens_app/features/classify/data/tflite_classifier.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

void main() {
  test('preprocess preserves RGB channel order and raw 0-255 values', () {
    final image = img.Image(width: 1, height: 1)..setPixelRgb(0, 0, 255, 40, 7);
    final tensor = TfliteClassifier.preprocess(img.encodePng(image));

    expect(tensor, hasLength(224 * 224 * 3));
    expect(tensor[0], 255);
    expect(tensor[1], 40);
    expect(tensor[2], 7);
    expect(tensor[(112 * 224 + 112) * 3], 255);
    expect(tensor[(112 * 224 + 112) * 3 + 1], 40);
    expect(tensor[(112 * 224 + 112) * 3 + 2], 7);
  });

  test('preprocess rejects image bytes it cannot decode', () {
    expect(
      () => TfliteClassifier.preprocess(Uint8List.fromList([1, 2, 3])),
      throwsFormatException,
    );
  });
}
