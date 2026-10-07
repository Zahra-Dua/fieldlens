"""Loads a .tflite model once and runs inference on images.

Model contract (from docs/model-card): input [1,224,224,3] RGB, raw 0-255 pixels
(the normalisation is baked INTO the model), output [1,5] softmax.
Classes are alphabetical, the same order used in training.

Two facts that shape this file:
  * Inference is CPU-heavy and blocking, so routes that call it must be plain `def`
    (run in FastAPI's threadpool), never `async def`.
  * A LiteRT Interpreter is NOT thread-safe: set_tensor -> invoke -> get_tensor share
    internal buffers. Two threads at once would mix up each other's data. A lock makes
    predictions take turns. (For more throughput: more processes, each with its own copy.)
"""

import io
import threading
import time
from pathlib import Path

import numpy as np
from PIL import Image, UnidentifiedImageError

CLASSES = ["GLASS", "METAL", "ORGANIC", "PAPER", "PLASTIC"]
IMAGE_SIZE = 224
MAX_IMAGE_BYTES = 10 * 1024 * 1024


class InvalidImage(Exception):
    pass


def preprocess(data: bytes) -> np.ndarray:
    """Bytes of any common image format -> float32 array [1,224,224,3], values 0-255.

    Must match training exactly: RGB, stretched (no crop) with bilinear resize.
    """
    if not data:
        raise InvalidImage("Uploaded image is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise InvalidImage(f"Image is larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImage("Could not read the upload as an image") from exc
    img = img.convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BILINEAR)
    return np.asarray(img, dtype=np.float32)[np.newaxis, ...]


class Predictor:
    def __init__(self, model_path: Path, version: str, num_threads: int = 2) -> None:
        # Imported here so the registry/tests that never predict don't need LiteRT loaded.
        from ai_edge_litert.interpreter import Interpreter

        self.version = version
        self.model_path = model_path
        self._lock = threading.Lock()
        self._interp = Interpreter(model_path=str(model_path), num_threads=num_threads)
        self._interp.allocate_tensors()
        self._in = self._interp.get_input_details()[0]
        self._out = self._interp.get_output_details()[0]

    def _to_model_input(self, x: np.ndarray) -> np.ndarray:
        dtype = self._in["dtype"]
        if dtype == np.float32:
            return x
        # Fully-int8 models store inputs as integers: real = scale * (q - zero_point)
        scale, zero = self._in["quantization"]
        info = np.iinfo(dtype)
        return np.clip(np.round(x / scale + zero), info.min, info.max).astype(dtype)

    def _from_model_output(self, y: np.ndarray) -> np.ndarray:
        if y.dtype == np.float32:
            return y
        scale, zero = self._out["quantization"]
        return (y.astype(np.float32) - zero) * scale

    def predict(self, data: bytes) -> dict:
        x = self._to_model_input(preprocess(data))      # slow-ish, but outside the lock
        start = time.perf_counter()
        with self._lock:                                 # only the interpreter is serialised
            self._interp.set_tensor(self._in["index"], x)
            self._interp.invoke()
            y = self._interp.get_tensor(self._out["index"])[0].copy()
        probs = self._from_model_output(y)
        latency_ms = (time.perf_counter() - start) * 1000
        best = int(np.argmax(probs))
        return {
            "label": CLASSES[best],
            "confidence": float(probs[best]),
            "scores": {c: float(p) for c, p in zip(CLASSES, probs)},
            "model_version": self.version,
            "latency_ms": round(latency_ms, 2),
        }