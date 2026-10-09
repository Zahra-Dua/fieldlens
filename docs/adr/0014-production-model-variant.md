# ADR: Production model is float16, run with XNNPACK

**Status:** Accepted
**Date:** 2026-10-09

## Background

We have one trained model in four shapes (variants): float32, float16, dynamic-range
and int8. On the phone we can also run each one in three ways (delegates): plain CPU,
XNNPACK (a faster CPU engine) or the GPU.

We need to pick **one variant and one way to run it** for the app. The numbers are in
`docs/benchmark.md`. They were measured on a real phone, a Samsung Galaxy A17
(SM-A175F, Android 16), with a profile build.

## Decision

The app uses the **float16** model and runs it with **XNNPACK on 4 threads**.
If XNNPACK fails for any reason, the app tries again on plain CPU.
The bundled model (inside the app) and the model that the server sends later are both float16.

## Why

| | float32 + XNNPACK | **float16 + XNNPACK** | dynamic + XNNPACK |
|---|---|---|---|
| Time per photo (mean) | 24 ms | **26 ms** | 32 ms |
| p95 time | 33 ms | **32 ms** | 38 ms |
| Size | 3.77 MB | **1.95 MB** | 1.13 MB |
| Accuracy on 984 test images | 0.9157 | **0.9146** | 0.9116 |

1. **float16 is as fast as float32.** 26 ms against 24 ms is the same thing for a person
   waiting for a result. The test is only one run on one phone, so a difference of a few
   milliseconds means nothing.
2. **float16 is half the size.** This matters most for the update download (see the OTA
   flow). A field worker may be on a weak mobile connection, so 1.95 MB is much better
   than 3.77 MB.
3. **float16 is not less accurate in any way we can see.** It got 900 images right and
   float32 got 901. One image out of 984 is noise.
4. **dynamic is the smallest, but it is not the best.** XNNPACK can only run 100 of its
   108 steps (it is split in 17 pieces), so it is slower than float32. It also has the
   lowest accuracy (0.9116).
5. **int8 is out.** Its accuracy is 0.8089, about 10 points lower. It is smaller and
   faster only on paper.
6. **The GPU is the worst choice on this phone.** One run takes 113 ms (float32) and
   142 ms (float16), and starting the GPU takes 500 to 675 ms. The app starts the model for
   every photo, so the GPU would cost almost one second per photo. XNNPACK costs about 30 ms.
   We were using the GPU before this benchmark. That was a guess and the numbers show it
   was wrong for this phone.

The fastest model is not automatically the right one. Here the fastest raw numbers
(dynamic on plain CPU, 45 ms) come with the lowest accuracy and a worse result with
XNNPACK, so we did not choose it.

## What we accept (the downsides)

- **We measured only one phone.** A newer phone with a strong GPU may be faster on the GPU.
  If we ever target such phones, we have to run the benchmark again.
- **float16 is slow on plain CPU** (78 ms against 51 ms for float32), because it has to be
  converted while running. This is only a problem if XNNPACK does not work and the CPU
  fallback is used. XNNPACK is built into TensorFlow Lite, so we expect this to be rare.
  Even 78 ms is fast enough for a photo.
- **float16 loses a tiny bit of accuracy** compared with float32 (0.9146 against 0.9157).
  We think this is noise, but we cannot prove it with this test set.
- **NNAPI was not tested.** The `flutter_litert` package does not offer it and Google has
  marked it deprecated since Android 15.

## What this does not fix

Turning the photo into the 224x224 input (decoding the JPEG and resizing it in Dart) takes
about 230 ms. That is ten times more than the model itself (about 25 ms). It runs in a
background isolate, so the screen stays smooth, but if we ever want the result faster,
this is the part to work on.

## The server side

The ML service on the server still runs float32 for its own `/predict` endpoint. That is
a different machine with a different CPU, so this decision does not apply to it.
The model registry will hold the float16 file for phones (we upload it in the OTA step).

## When to look at this again

- A new phone type becomes important (benchmark again).
- Accuracy on real photos from the field gets worse than on the test set.
- We train a new model (then the table changes).
