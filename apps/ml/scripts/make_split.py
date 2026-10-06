"""Build apps/ml/data/processed/ with a group-aware 70/15/15 split.

Near-duplicate images are clustered first (perceptual hash, within each
target class), then every cluster is assigned to exactly ONE split. That
way a duplicate can never sit in train while its twin sits in test.

Reproducible: fixed seed, sorted inputs, processed/ is rebuilt from scratch.

Usage:
    python apps/ml/scripts/make_split.py [raw_root] [processed_root]
"""

import csv
import random
import shutil
import sys
from collections import defaultdict
from pathlib import Path

from find_duplicates import (
    CLASS_MAP,
    IMAGE_SUFFIXES,
    find_root,
    find_source_folders,
    hash_image,
)

SEED = 42
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}

# Loose on purpose: grouping two different images only forces them into the
# same split (harmless), while missing a duplicate causes leakage.
GROUP_DISTANCE_THRESHOLD = 4

# Mislabelled images found via cross-class duplicate pairs (see docs/).
# File names are unique across source folders because they carry the folder
# name as a prefix (e.g. "white-glass761.jpg").
EXCLUDE = {
    "metal459.jpg",        # glass bottle, labelled metal
    "white-glass761.jpg",  # plastic bottle, labelled glass
    "plastic159.jpg",      # glass bottle, labelled plastic
}

Item = tuple[Path, int]  # (file, 64-bit phash as int)


def collect_by_target(raw_root: Path) -> dict[str, list[Item]]:
    """Hash every kept image and bucket it by target class."""
    by_target: dict[str, list[Item]] = defaultdict(list)
    for folder in find_source_folders(raw_root):
        target = CLASS_MAP[folder.name.lower()]
        for file in sorted(folder.iterdir()):
            if file.suffix.lower() not in IMAGE_SUFFIXES or file.name in EXCLUDE:
                continue
            bits = hash_image(file)
            if bits is not None:
                by_target[target].append((file, bits))
    return by_target


def cluster(items: list[Item]) -> list[list[Item]]:
    """Union-find over pairs whose hashes are within the threshold."""
    parent = list(range(len(items)))
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if (items[i][1] ^ items[j][1]).bit_count() <= GROUP_DISTANCE_THRESHOLD:
                parent[find_root(parent, i)] = find_root(parent, j)
    groups: dict[int, list[Item]] = defaultdict(list)
    for i, item in enumerate(items):
        groups[find_root(parent, i)].append(item)
    return list(groups.values())


def assign_splits(groups: list[list[Item]], rng: random.Random) -> list[str]:
    """Give each group to the split that is furthest below its target size."""
    total = sum(len(g) for g in groups)
    wanted = {split: ratio * total for split, ratio in SPLIT_RATIOS.items()}
    filled = dict.fromkeys(SPLIT_RATIOS, 0)
    order = list(range(len(groups)))
    rng.shuffle(order)
    result = [""] * len(groups)
    for idx in order:
        split = max(wanted, key=lambda s: wanted[s] - filled[s])
        filled[split] += len(groups[idx])
        result[idx] = split
    return result


def main(raw_root: Path, out_root: Path) -> None:
    if not raw_root.is_dir():
        sys.exit(f"{raw_root} does not exist.")

    by_target = collect_by_target(raw_root)
    if not by_target:
        sys.exit("No images found. Check the raw folder path.")

    if out_root.exists():
        shutil.rmtree(out_root)  # rebuild from scratch so runs are identical

    rng = random.Random(SEED)
    rows: list[dict[str, str | int]] = []
    group_id = 0

    for target in sorted(by_target):
        groups = cluster(by_target[target])
        splits = assign_splits(groups, rng)
        for group, split in zip(groups, splits):
            for file, _ in group:
                destination = out_root / split / target
                destination.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, destination / file.name)
                rows.append(
                    {
                        "file": file.name,
                        "source": file.parent.name,
                        "target": target,
                        "split": split,
                        "group_id": group_id,
                    }
                )
            group_id += 1

    manifest = out_root / "manifest.csv"
    with manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    # Safety net: no group may appear in more than one split.
    splits_per_group: dict[int, set[str]] = defaultdict(set)
    for row in rows:
        splits_per_group[int(row["group_id"])].add(str(row["split"]))
    leaking = [g for g, s in splits_per_group.items() if len(s) > 1]
    if leaking:
        sys.exit(f"LEAKAGE: groups {leaking} span several splits.")

    counts: dict[tuple[str, str], int] = defaultdict(int)
    for row in rows:
        counts[(str(row["target"]), str(row["split"]))] += 1

    print(f"{'class':10} {'train':>6} {'val':>6} {'test':>6} {'total':>6}")
    for target in sorted(by_target):
        per_split = [counts[(target, s)] for s in SPLIT_RATIOS]
        print(f"{target:10} " + " ".join(f"{c:6}" for c in per_split) + f" {sum(per_split):6}")
    print(f"\nExcluded: {len(EXCLUDE)} | groups: {group_id} | leakage check: passed")
    print(f"Manifest: {manifest}")


if __name__ == "__main__":
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("apps/ml/data/raw")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("apps/ml/data/processed")
    main(raw, out)