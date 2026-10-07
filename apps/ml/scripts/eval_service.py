"""Run the SERVICE's own predictor over the whole test split.

Why: the model was evaluated in Colab (acc 0.9177 for float32). If the service's
preprocessing (PIL resize, RGB, 0-255) differs from training even slightly, accuracy
here would drop. Matching the Colab number proves the service sees what training saw.

Run from the repo root:
    python -m uv --directory apps/ml run python scripts/eval_service.py
"""

import sys
from collections import Counter, defaultdict
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_ROOT))

from app.main import BUNDLED_MODEL  # noqa: E402
from app.predictor import CLASSES, Predictor  # noqa: E402

TEST_DIR = ML_ROOT / "data" / "processed" / "test"


def main() -> None:
    predictor = Predictor(BUNDLED_MODEL, "eval")
    total = correct = 0
    per_class = defaultdict(lambda: [0, 0])          # class -> [correct, total]
    confusion = defaultdict(Counter)                  # true -> Counter(predicted)
    wrong_files = defaultdict(list)

    for class_dir in sorted(p for p in TEST_DIR.iterdir() if p.is_dir()):
        true = class_dir.name.upper()
        for img in sorted(class_dir.iterdir()):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            res = predictor.predict(img.read_bytes())
            total += 1
            per_class[true][1] += 1
            confusion[true][res["label"]] += 1
            if res["label"] == true:
                correct += 1
                per_class[true][0] += 1
            else:
                wrong_files[true].append((img.name, res["label"], res["confidence"]))

    print(f"\nOverall accuracy: {correct}/{total} = {correct / total:.4f}   (Colab float32: 0.9177)\n")
    print(f"{'class':8} {'recall':>7}   predicted as")
    for c in CLASSES:
        ok, n = per_class[c]
        print(f"{c:8} {ok / n:7.3f}   {dict(confusion[c])}")
    print("\nFirst wrong GLASS images (open these and look):")
    for name, pred, conf in wrong_files["GLASS"][:8]:
        print(f"  {name:28} -> {pred} ({conf:.2f})")


if __name__ == "__main__":
    main()
