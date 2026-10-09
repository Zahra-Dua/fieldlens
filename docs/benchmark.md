# On-device benchmark (Day 15)

**Device:** Samsung Galaxy A17 (SM-A175F), Android 16, real phone (not an emulator).
**Build:** Flutter `--profile` build (debug builds are several times slower and not comparable).
**Runtime:** `flutter_litert` 3.9.3 (TensorFlow Lite / LiteRT).
**Date:** 2026-10-09.

## Method

- **Latency** is the time of one `interpreter.run()` on a 224x224x3 float32 input, in a
  background isolate (the same way the app runs it). 10 warm-up runs, then 100 timed runs.
  Preprocessing (decode + resize) is **not** included; it is reported separately.
- **Interpreter create** is the time to build the interpreter, including starting the delegate.
  The app currently builds a new interpreter for every photo, so this cost is paid every time.
- **Accuracy** is measured once on the CPU on the 984-image test split, with the service's
  preprocessing (`apps/ml/scripts/bench_accuracy.py`). It does not depend on the phone.
  The GPU delegate computes in float16 and may move a probability slightly.
- Delegates: `CPU` = plain TFLite CPU kernels, `XNNPACK` = XNNPACK on 4 threads, `GPU` = GPU delegate.
  NNAPI is not offered by `flutter_litert` (and is deprecated by Google since Android 15), so it is not tested.
- One run per combination, one device. Differences of a few milliseconds are within noise.

## Results

| Variant | Delegate | Delegate active | Size (MB) | Accuracy | Create (ms) | Mean (ms) | p50 (ms) | p95 (ms) |
|---|---|---|---|---|---|---|---|---|
| float32 | CPU | no | 3.77 | 0.9157 | 7.49 | 51.47 | 46.70 | 78.10 |
| float32 | XNNPACK | yes | 3.77 | 0.9157 | 7.83 | **24.33** | 22.72 | **32.90** |
| float32 | GPU | yes | 3.77 | 0.9157 | 675.45 | 113.41 | 97.34 | 154.65 |
| float16 | CPU | no | 1.95 | 0.9146 | 3.63 | 78.14 | 80.08 | 86.78 |
| float16 | XNNPACK | yes | 1.95 | 0.9146 | 6.90 | 26.28 | 25.08 | 32.10 |
| float16 | GPU | yes | 1.95 | 0.9146 | 539.15 | 142.35 | 141.39 | 162.23 |
| dynamic | CPU | no | 1.13 | 0.9116 | 2.94 | 45.40 | 43.57 | 61.74 |
| dynamic | XNNPACK | partly (100/108 nodes) | 1.13 | 0.9116 | 7.14 | 31.62 | 31.05 | 37.64 |
| dynamic | GPU | partly (106/108 nodes) | 1.13 | 0.9116 | 493.98 | 137.87 | 137.62 | 156.81 |

`int8` (1.24 MB) is not benchmarked: its accuracy is 0.8089 on the same test set, about 10 points lower.

All nine combinations classify the sample photo as PLASTIC (0.91 to 0.94).

**Preprocessing in Dart** (decode the JPEG + TensorFlow-style bilinear resize to 224x224), sample
photo `big.jpeg` (121 KB): about 224 to 237 ms in every row except the first (347 ms, cold start).
This depends on the photo size.

## What the numbers say

1. **The GPU delegate is the slowest option on this phone**: 113 ms per run for float32 against
   24 ms with XNNPACK, and 500 to 675 ms to start it. With a new interpreter per photo, the GPU
   path costs about 0.8 s per classification; XNNPACK costs about 30 ms.
2. **float16 is as fast as float32 with XNNPACK** (26 ms vs 24 ms) at half the size
   (1.95 MB vs 3.77 MB), and loses one image out of 984 in accuracy (0.9146 vs 0.9157), which is noise.
   On plain CPU, float16 is slower (78 ms vs 51 ms) because the weights are converted to float32 on the fly.
3. **dynamic-range quantisation is the smallest but not the best**: XNNPACK delegates only
   100 of 108 nodes (17 partitions), so it is slower than float32 there, and the GPU delegate
   rejects the `FULLY_CONNECTED` op version. Accuracy is the lowest of the three float-input variants.
4. **Preprocessing (about 230 ms) is ten times the inference time (about 25 ms)** with XNNPACK. It runs in a
   background isolate so the UI stays smooth, but it is where any further speed-up has to come from.
