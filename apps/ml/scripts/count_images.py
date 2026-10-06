"""Count images per source folder and per FieldLens target class."""

import sys
from collections import Counter
from pathlib import Path

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

# Source folder -> target class, as decided in ADR 0002.
CLASS_MAP = {
    "plastic": "PLASTIC",
    "brown-glass": "GLASS",
    "green-glass": "GLASS",
    "white-glass": "GLASS",
    "metal": "METAL",
    "paper": "PAPER",
    "cardboard": "PAPER",
    "biological": "ORGANIC",
}


def count_by_source(raw_root: Path) -> Counter[str]:
    """Count the images sitting directly inside each folder under raw_root."""
    counts: Counter[str] = Counter()
    for folder in (p for p in raw_root.rglob("*") if p.is_dir()):
        images = sum(1 for f in folder.iterdir() if f.suffix.lower() in IMAGE_SUFFIXES)
        if images:
            counts[folder.name.lower()] += images
    return counts


def main(raw_root: Path) -> None:
    if not raw_root.is_dir():
        sys.exit(f"{raw_root} does not exist. Put the downloaded dataset there.")

    by_source = count_by_source(raw_root)

    print("Source folders")
    for name, count in sorted(by_source.items()):
        used = CLASS_MAP.get(name, "(not used)")
        print(f"  {name:14} {count:6}  -> {used}")

    by_target: Counter[str] = Counter()
    for name, count in by_source.items():
        if name in CLASS_MAP:
            by_target[CLASS_MAP[name]] += count

    print("\nTarget classes")
    for name, count in sorted(by_target.items()):
        print(f"  {name:10} {count:6}")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("apps/ml/data/raw"))