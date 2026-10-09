import 'dart:io';
import 'dart:isolate';

import 'package:fieldlens_app/features/classify/domain/classification.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_litert/native.dart' as litert;
import 'package:image/image.dart' as img;

/// Runs the bundled FieldLens model.
///
/// The model contract (docs/model_card.md): input [1, 224, 224, 3] float32,
/// RGB, raw pixel values 0-255 (normalisation is INSIDE the model), output
/// [1, 5] softmax. The photo is stretched to 224x224 (no crop) the way training
/// did it: TensorFlow-style bilinear, half-pixel centres, NO antialiasing.
class TfliteClassifier {
  TfliteClassifier._(this._interpreter);

  /// Bundled float32 model; the model card does not recommend full int8.
  static const modelAsset = 'assets/models/fieldlens_float16.tflite';

  /// Required model input width and height.
  static const inputSize = 224;

  final litert.Interpreter _interpreter;

  /// Loads the bundled model and classifies [photoBytes] off the UI isolate.
  ///
  /// Loads the bundled model and classifies [photoBytes] off the UI isolate.
  ///
  /// The model runs with XNNPACK (the fastest option on the phone we measured,
  /// see docs/benchmark.md). If that fails, it is retried once on the plain CPU.
  static Future<Classification> classifyInBackground(
    Uint8List photoBytes,
  ) async {
    final asset = await rootBundle.load(modelAsset);
    final modelBytes = asset.buffer.asUint8List(
      asset.offsetInBytes,
      asset.lengthInBytes,
    );
    final scores = await compute<_InferenceMessage, List<double>>(
      _runInference,
      _InferenceMessage(
        TransferableTypedData.fromList([modelBytes]),
        TransferableTypedData.fromList([photoBytes]),
      ),
      debugLabel: 'FieldLens image classification',
    );
    var best = 0;
    for (var i = 1; i < scores.length; i++) {
      if (scores[i] > scores[best]) best = i;
    }
    return Classification(
      label: kClassLabels[best],
      confidence: scores[best],
      scores: List<double>.unmodifiable(scores),
    );
  }

  /// Loads a synchronous interpreter, intended for probes and tests.
  static Future<TfliteClassifier> load({String asset = modelAsset}) async {
    final interpreter = await litert.Interpreter.fromAsset(asset);
    return TfliteClassifier._(interpreter);
  }

  /// Converts encoded photo bytes to a flat 224x224 RGB float32 tensor.
  ///
  /// Static and pure so preprocessing can run in the inference isolate.
  ///
  /// Pixels remain in the raw 0-255 range. The resize is implemented by hand
  /// because training used `tf.image.resize` and the pixel values must match.
  static Float32List preprocess(Uint8List photoBytes) {
    final img.Image? decoded;
    try {
      decoded = img.decodeImage(photoBytes);
    } on Object catch (error) {
      throw FormatException('Could not decode the image: $error');
    }
    if (decoded == null) {
      throw const FormatException('Could not decode the image');
    }

    final oriented = img.bakeOrientation(decoded);
    final src = oriented.numChannels >= 3
        ? oriented
        : oriented.convert(numChannels: 3);

    final xs = _axis(inputSize, src.width);
    final ys = _axis(inputSize, src.height);

    final values = Float32List(inputSize * inputSize * 3);
    var i = 0;
    for (var y = 0; y < inputSize; y++) {
      final y0 = ys.lo[y];
      final y1 = ys.hi[y];
      final fy = ys.frac[y];
      for (var x = 0; x < inputSize; x++) {
        final x0 = xs.lo[x];
        final x1 = xs.hi[x];
        final fx = xs.frac[x];
        final p00 = src.getPixel(x0, y0);
        final p01 = src.getPixel(x1, y0);
        final p10 = src.getPixel(x0, y1);
        final p11 = src.getPixel(x1, y1);
        values[i++] = _blend(p00.r, p01.r, p10.r, p11.r, fx, fy);
        values[i++] = _blend(p00.g, p01.g, p10.g, p11.g, fx, fy);
        values[i++] = _blend(p00.b, p01.b, p10.b, p11.b, fx, fy);
      }
    }
    return values;
  }

  static double _blend(num a, num b, num c, num d, double fx, double fy) {
    final top = a * (1 - fx) + b * fx;
    final bottom = c * (1 - fx) + d * fx;
    return top * (1 - fy) + bottom * fy;
  }

  /// For each output index: the two source indices to blend and the weight.
  static ({List<int> lo, List<int> hi, List<double> frac}) _axis(
    int out,
    int inp,
  ) {
    final lo = List<int>.filled(out, 0);
    final hi = List<int>.filled(out, 0);
    final frac = List<double>.filled(out, 0);
    final scale = inp / out;
    for (var i = 0; i < out; i++) {
      var s = (i + 0.5) * scale - 0.5; // half-pixel centres
      if (s < 0) s = 0;
      final floor = s.floor();
      lo[i] = floor < inp - 1 ? floor : inp - 1;
      hi[i] = lo[i] + 1 < inp - 1 ? lo[i] + 1 : inp - 1;
      frac[i] = s - floor;
    }
    return (lo: lo, hi: hi, frac: frac);
  }

  /// Classifies [photoBytes] synchronously using this interpreter.
  Classification classify(Uint8List photoBytes) {
    final input = preprocess(photoBytes)
        .reshape<Object>([1, inputSize, inputSize, 3]);
    final output = [List<double>.filled(kClassLabels.length, 0)];
    _interpreter.run(input, output);
    final scores = output[0];
    var best = 0;
    for (var i = 1; i < scores.length; i++) {
      if (scores[i] > scores[best]) best = i;
    }
    return Classification(
      label: kClassLabels[best],
      confidence: scores[best],
      scores: List<double>.unmodifiable(scores),
    );
  }

  /// Releases the native interpreter resources.
  void close() => _interpreter.close();
}

class _InferenceMessage {
  const _InferenceMessage(this.modelBytes, this.photoBytes);

  final TransferableTypedData modelBytes;
  final TransferableTypedData photoBytes;
}

List<double> _runInference(_InferenceMessage message) {
  final modelBytes = message.modelBytes.materialize().asUint8List();
  final photoBytes = message.photoBytes.materialize().asUint8List();
  // A bad photo throws here, before any fallback. Retrying would not help.
  final input = TfliteClassifier.preprocess(photoBytes).reshape<Object>([
    1,
    TfliteClassifier.inputSize,
    TfliteClassifier.inputSize,
    3,
  ]);
  try {
    return _run(
      modelBytes,
      input,
      const litert.PerformanceConfig.xnnpack(numThreads: 4),
    );
  } on Object catch (error) {
    stderr.writeln('FieldLens XNNPACK failed; retrying on CPU: $error');
    return _run(modelBytes, input, litert.PerformanceConfig.disabled);
  }
}

List<double> _run(
  Uint8List modelBytes,
  Object input,
  litert.PerformanceConfig config,
) {
  final (options, delegate) = litert.InterpreterFactory.create(config);
  litert.Interpreter? interpreter;
  try {
    interpreter = _createInterpreter(modelBytes, options);
    final output = [List<double>.filled(kClassLabels.length, 0)];
    interpreter.run(input, output);
    return output.single;
  } finally {
    interpreter?.close();
    delegate?.delete();
  }
}

litert.Interpreter _createInterpreter(
  Uint8List modelBytes,
  litert.InterpreterOptions options,
) {
  try {
    return litert.Interpreter.fromBuffer(modelBytes, options: options);
  } finally {
    options.delete();
  }
}

List<double> _runOnCpu(Uint8List modelBytes, Object input) {
  final (options, _) = litert.InterpreterFactory.create(
    litert.PerformanceConfig.disabled,
  );
  final interpreter = _createInterpreter(modelBytes, options);
  try {
    final output = [List<double>.filled(kClassLabels.length, 0)];
    interpreter.run(input, output);
    return output.single;
  } finally {
    interpreter.close();
  }
}
