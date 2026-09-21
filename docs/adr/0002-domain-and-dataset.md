# ADR 0002: Domain and dataset

**Date:** 2026-09-21
**Status:** accepted

## Context

The program lets you pick any classification domain (waste sorting, plant
disease, surface defects, retail shelf state, or machine part ID) as long as
you stick with it for the month. Whatever I pick also decides what dataset I
need — and the dataset needs at least 200 images per class across 4-6
classes, with a licence I can actually point to.

## Options considered

**Domain:**
1. Plant leaf disease — good datasets exist (PlantVillage), but hard to demo
   live without actual diseased leaves on hand.
2. Surface defects — same issue, hard to get physical defective samples for
   a live demo.
3. Leaf Dataset — Dataset that I found was categorized as Plants and their leaves, 
   I was unable to understand either to go with only one plant and its leaves or do 
   it with all.
4. Waste sorting — I can demo this with literally any bottle, can, or piece
   of paper lying around. Also naturally splits into 5 clear classes.

**Dataset (for waste sorting):**
1. TrashNet — clean, ~2,500 images, but no organic/food-waste class, and
   photos are plain white-background lab shots, not realistic.
2. TACO — real outdoor litter photos, nice and realistic, but it's built for
   object detection (bounding boxes), not classification. Would need extra
   work to crop it into a clean classification dataset — too much scope
   creep for Day 1.
3. Kaggle "Garbage Classification" (mostafaabla) — ~15,000 images, 12
   classes, and importantly it already has a `biological` class, which is
   exactly what I need for "organic."

## Decision

Domain: **Waste sorting**, with 5 classes — `PLASTIC`, `GLASS`, `METAL`,
`PAPER`, `ORGANIC`.

Dataset: Kaggle "Garbage Classification" by mostafaabla —
https://www.kaggle.com/datasets/mostafaabla/garbage-classification

**Licence:** Open Database License (ODbL) — database/collection is ODbL,
individual image contents stay © the original authors. I can use and modify
it for training as long as I give attribution (this ADR is that attribution)
and, if I ever publicly re-share the processed dataset, it stays under the
same licence.

**Mapping 12 source classes → 5 target classes:**

| Target      | Comes from                             |
| ----------- | ---------------------------------------- |
| `PLASTIC`   | plastic                                    |
| `GLASS`     | brown-glass, green-glass, white-glass       |
| `METAL`     | metal                                       |
| `PAPER`     | paper, cardboard                             |
| `ORGANIC`   | biological                                    |

Not using: `battery`, `clothes`, `shoes`, `trash` — outside the 5 classes I
picked, so they're just left out when I build the processed dataset later.

## Rationale

Waste sorting is the easiest of the five suggested domains to demo live and
end-to-end. This dataset was the only option of the three I looked at that
already had an organic/biological class, so I didn't need to go find and
licence a second dataset just for that one category. TACO would've been
more "realistic" but the object-detection → classification conversion work
isn't something this timeline has room for.

## Consequences

- The raw 12-class download stays untouched and isn't committed to Git
  (it's big, and datasets shouldn't be in the repo anyway — it's in
  `.gitignore`).
- On Day 11, a script will read the raw download and build a
  `data/processed/` folder with just the 5 mapped classes, so it's
  reproducible instead of done by hand.
- Need to check class balance once mapped — `biological` might end up
  smaller than the others since it's only one source class doing the work
  of "organic." If it's skewed, I'll deal with it on Day 11.
- If the organic class turns out too small/weak, I'll come back and update
  this ADR (mark it superseded) with a plan B.
