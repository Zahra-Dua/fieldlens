"""Find near-duplicate images across the 8 source folders FieldLens uses.

Uses perceptual hashing (phash): two images whose hashes differ by only a
few bits look the same, even after a resize, crop or recompression.

Two kinds of pairs are reported separately, because they need different fixes:
  * within one TARGET class (e.g. brown-glass vs white-glass, both GLASS):
    leakage risk. The split script will keep each group in one split.
  * across different target classes (e.g. plastic vs metal): label noise.

This script only REPORTS. It never deletes or moves anything.

Usage:
    python apps/ml/scripts/find_duplicates.py [raw_root] [threshold]
"""

import sys
from collections import Counter
from pathlib import Path

import imagehash
from PIL import Image

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}

# Default max differing bits (out of 64) for two images to count as
# near-duplicates. Overridable from the command line so we can pick the
# value by looking at the distance histogram instead of guessing.
HASH_DISTANCE_THRESHOLD = 5

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


def find_source_folders(raw_root: Path) -> list[Path]:
    """Return the mapped source folders, however deeply they are nested."""
    return sorted(
        p for p in raw_root.rglob("*") if p.is_dir() and p.name.lower() in CLASS_MAP
    )


def hash_image(path: Path) -> int | None:
    """phash as a 64-bit int, so distance is a fast XOR + bit count."""
    try:
        with Image.open(path) as img:
            return int(str(imagehash.phash(img)), 16)
    except Exception as error:  # corrupt files exist in scraped datasets
        print(f"  ! could not read {path.name}: {error}")
        return None


def find_root(parent: list[int], i: int) -> int:
    """Union-find lookup with path compression."""
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def label(paths: list[Path], i: int) -> str:
    return f"{paths[i].parent.name}/{paths[i].name}"


def main(raw_root: Path, threshold: int) -> None:
    if not raw_root.is_dir():
        sys.exit(f"{raw_root} does not exist.")

    paths: list[Path] = []
    targets: list[str] = []
    hashes: list[int] = []

    for folder in find_source_folders(raw_root):
        target = CLASS_MAP[folder.name.lower()]
        count_before = len(paths)
        for file in sorted(folder.iterdir()):
            if file.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            bits = hash_image(file)
            if bits is not None:
                paths.append(file)
                targets.append(target)
                hashes.append(bits)
        print(f"{folder.name:12} -> {target:8} {len(paths) - count_before} hashed")

    if not paths:
        sys.exit("No images hashed. Check the raw folder path.")

    n = len(paths)
    parent = list(range(n))  # union-find: each image starts as its own group
    pair_distances: list[tuple[int, int, int]] = []
    cross_class_pairs: list[tuple[int, int, int]] = []

    print(f"\nComparing {n} images pairwise (threshold {threshold})...")
    for i in range(n):
        for j in range(i + 1, n):
            distance = (hashes[i] ^ hashes[j]).bit_count()
            if distance > threshold:
                continue
            if targets[i] == targets[j]:
                pair_distances.append((i, j, distance))
                parent[find_root(parent, i)] = find_root(parent, j)
            else:
                cross_class_pairs.append((i, j, distance))

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find_root(parent, i), []).append(i)
    dupe_groups = [g for g in groups.values() if len(g) > 1]

    print(f"\n{'=' * 50}\nDistance histogram (within-class pairs)\n{'=' * 50}")
    histogram = Counter(d for _, _, d in pair_distances)
    for d in range(threshold + 1):
        print(f"  distance {d}: {histogram[d]} pairs")

    print(f"\n{'=' * 50}\nWithin-class pairs, loosest first\n{'=' * 50}")
    for i, j, d in sorted(pair_distances, key=lambda p: -p[2]):
        print(f"  d={d}  {label(paths, i)}  <->  {label(paths, j)}")

    print(f"\n{'=' * 50}\nWITHIN-CLASS duplicate groups\n{'=' * 50}")
    for group in sorted(dupe_groups, key=lambda g: (targets[g[0]], paths[g[0]].name)):
        names = ", ".join(label(paths, i) for i in group)
        print(f"[{targets[group[0]]}] ({len(group)} files): {names}")

    print(f"\n{'=' * 50}\nCROSS-CLASS pairs (possible label noise)\n{'=' * 50}")
    for i, j, d in sorted(cross_class_pairs, key=lambda p: -p[2]):
        print(
            f"  d={d}  {targets[i]}:{label(paths, i)}  <->  "
            f"{targets[j]}:{label(paths, j)}"
        )

    excess = sum(len(g) - 1 for g in dupe_groups)
    print(f"\n{'=' * 50}")
    print(f"Threshold:                      {threshold}")
    print(f"Images hashed:                  {n}")
    print(f"Within-class duplicate groups:  {len(dupe_groups)}")
    print(f"Excess files in those groups:   {excess}")
    print(f"Cross-class pairs:              {len(cross_class_pairs)}")


if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("apps/ml/data/raw")
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else HASH_DISTANCE_THRESHOLD
    main(root, limit)