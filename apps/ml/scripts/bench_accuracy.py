"""Accuracy + size of every model variant, on the same test split.

Day 15, task 1. Latency is measured on the phone (main_bench.dart); accuracy does
not depend on the phone, so it is measured here, once, with the service's own
preprocessing (the one proven to match training).

Every *.tflite in apps/ml/models/ is evaluated. Run from the repo root:
    python -m uv --directory apps/ml run python scripts/bench_accuracy.py

Note: this runs on the CPU. The phone's GPU delegate computes in float16 and can
move a probability slightly; it should not change the class on all but a handful
of borderline images. Say so in the ADR instead of claiming it is identical.
"""

import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))

from app.predictor import Predictor  # noqa: E402

MODELS_DIR = ML_ROOT / "models"
TEST_DIR = ML_ROOT / "data" / "processed" / "test"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def evaluate(model_path: Path) -> tuple[int, int]:
    predictor = Predictor(model_path, model_path.stem)
    correct = total = 0
    for class_dir in sorted(p for p in TEST_DIR.iterdir() if p.is_dir()):
        true = class_dir.name.upper()
        for img in sorted(class_dir.iterdir()):
            if img.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            total += 1
            if predictor.predict(img.read_bytes())["label"] == true:
                correct += 1
    return correct, total


def main() -> None:
    models = sorted(MODELS_DIR.glob("*.tflite"))
    if not models:
        sys.exit(f"No .tflite files in {MODELS_DIR}")

    print(f"\nTest set: {TEST_DIR}\n")
    print("| file | size (MB) | correct | accuracy |")
    print("|---|---|---|---|")
    for path in models:
        correct, total = evaluate(path)
        size_mb = path.stat().st_size / 1_000_000
        print(f"| {path.name} | {size_mb:.2f} | {correct}/{total} | {correct / total:.4f} |")


if __name__ == "__main__":
    main()
