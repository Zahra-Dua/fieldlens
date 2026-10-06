# Model card: FieldLens waste classifier

## Model
- Architecture: MobileNetV3-Small, ImageNet-pretrained, new 5-class softmax head
- Training: stage 1 trains the head (frozen base, lr 1e-3); stage 2 fine-tunes the last 40 layers (BatchNorm frozen, lr 1e-5). Class weights, early stopping on val loss.
- Files: `fieldlens_float32.tflite`, `fieldlens_float16.tflite`, `fieldlens_int8.tflite`, `fieldlens_dynamic.tflite`

## Variants and results (test set, 984 images)
| variant | size_MB | accuracy | macro_F1 | METAL_recall | same_class_as_keras | default_cpu_delegate |
| --- | --- | --- | --- | --- | --- | --- |
| float32 | 3.77 | 0.9177 | 0.909 | 0.93 | 1.0 | ok |
| float16 | 1.95 | 0.9167 | 0.9075 | 0.922 | 0.999 | ok |
| int8 | 1.24 | 0.8079 | 0.7876 | 0.896 | 0.8354 | ok |
| dynamic_range | 1.13 | 0.9126 | 0.9012 | 0.93 | 0.9675 | ok |
| keras (reference) |  | 0.9177 | 0.909 |  | 1.0 |  |

- **float32**: baseline, no quantization.
- **float16**: weights stored in 16 bits.
- **int8**: full integer quantization (weights and activations), calibrated with a representative dataset of 1000 train images (200 per class). Input and output stay float32.
- **dynamic_range**: weights in int8, activations stay float at run time. No calibration data needed.

**Recommendation:** the full int8 variant is NOT recommended for production. It lost about 10 accuracy points and agrees with float32 on only about 84% of images. The candidates for production are float16 and dynamic_range (within about 0.5 points of float32). The final choice is made after the Day 15 on-device benchmark and recorded in an ADR.

## Input (the contract the app must follow)
- Tensor shape: `[1, 224, 224, 3]`, dtype `float32` (all four files)
- Channel order: **RGB**
- Pixel values: **raw 0 to 255** as floats. Do NOT divide by 255 and do NOT subtract a mean.
  Scaling is done inside the model (`include_preprocessing=True`).
- Resize: straight to 224x224, **bilinear**, **no cropping and no aspect-ratio padding** (the image is stretched).
- Test the app by running one image through Python and Dart and comparing the output tensors.

## Output
- Shape `[1, 5]`, float32, **softmax probabilities** (sum to 1).
- Class order (index to label): 0=GLASS, 1=METAL, 2=ORGANIC, 3=PAPER, 4=PLASTIC
- There is no 'unknown' class: the model always picks one of the five. The app should treat low confidence as `uncertain`.

## Training data
- Kaggle 'Garbage Classification' (ODbL), 8 source folders mapped to 5 classes (see `docs/dataset.md`).
- Split (group-aware, seed 42): 4598 train / 986 val / 984 test.
- Train counts: {'GLASS': 1407, 'METAL': 538, 'ORGANIC': 689, 'PAPER': 1359, 'PLASTIC': 605}. Class weights: {'GLASS': 0.65, 'METAL': 1.71, 'ORGANIC': 1.33, 'PAPER': 0.68, 'PLASTIC': 1.52}
- Augmentation (train only): horizontal flip, rotation, zoom, brightness.

## Per-class results (float32, test set)
```
              precision    recall  f1-score   support

       GLASS      0.944     0.847     0.893       301
       METAL      0.823     0.930     0.873       115
     ORGANIC      0.966     0.973     0.970       148
       PAPER      0.953     0.983     0.968       291
     PLASTIC      0.822     0.860     0.841       129

    accuracy                          0.918       984
   macro avg      0.902     0.919     0.909       984
weighted avg      0.920     0.918     0.918       984

```

## Known limitations
- Only 5 classes. Anything else (clothes, batteries, mixed items) still gets one of the five.
- GLASS is often confused with PLASTIC (21 test images) and METAL (18): shiny, transparent containers. Source images are web-scraped and some label noise remains.
- Small test sets: METAL has only 115 test images, so its recall is uncertain by about +/-5 points.
- Many photos are single objects on plain backgrounds. Messy, real-world scenes may score lower.
- Post-training full int8 hurts this model (MobileNetV3 hard-swish and squeeze-excite blocks are quantization-sensitive; more calibration images did not help). Possible fixes: quantization-aware training, a quantization-friendly backbone (EfficientNet-Lite0, minimalistic MobileNetV3).
- The int8 file calibrated with 300 images failed to load with TFLite's default XNNPACK delegate; the 1000-image version loaded. Always test the exact file with the default delegate on a real device.
- Accuracy is measured with TensorFlow image decoding. The phone's decoder may differ very slightly.