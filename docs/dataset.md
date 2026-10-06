# Dataset: FieldLens waste sorting

## Source and licence

- **Dataset:** Kaggle "Garbage Classification" by mostafaabla
  (https://www.kaggle.com/datasets/mostafaabla/garbage-classification)
- **Licence:** Open Database License (ODbL), as recorded in ADR 0002.
  Individual image contents remain copyright of their original authors.
  If the processed dataset is ever shared publicly, it stays under ODbL.
- The raw download is never committed (`apps/ml/data/` is gitignored).

## Classes

The source has 12 folders. FieldLens uses 8 of them, mapped to 5 classes
(ADR 0002):

| Target class | Source folders |
| --- | --- |
| PLASTIC | plastic |
| GLASS | brown-glass, green-glass, white-glass |
| METAL | metal |
| PAPER | paper, cardboard |
| ORGANIC | biological |

Not used: battery, clothes, shoes, trash.

## Cleaning

Everything below is done by `apps/ml/scripts/make_split.py`, so the
processed dataset can be rebuilt from the raw download with one command.
The raw folder is never modified.

### Near-duplicates

The source was scraped from the web and contains near-identical images
(crops, recompressions, and colour-shifted copies, for example a brown
bottle that appears again in green).

- Method: perceptual hash (phash, 64 bits) per image. Two images are
  near-duplicates when their hashes differ by at most 4 bits.
- Result: 93 duplicate groups containing 200 images (107 excess files,
  about 1.6% of the dataset). Several groups span source folders, e.g.
  brown-glass and green-glass.
- Handling: duplicates are **not deleted**. They are clustered, and each
  cluster is assigned to exactly one split, so a duplicate can never sit
  in train while its twin sits in test.
- Why 4: phash distances here only come out as 0, 2 or 4, so 4 and 5 give
  the same result. A looser threshold risks grouping unrelated images
  (this only forces them into the same split, which is harmless). A tighter
  one misses real duplicates, which causes leakage. Leakage is the worse
  error, so the threshold errs loose.

### Label noise

Images that appear (as near-duplicates) under two different classes were
inspected by eye. Three were mislabelled, and one copy of each was removed:

| Removed | Why |
| --- | --- |
| metal459.jpg | glass bottle labelled metal |
| white-glass761.jpg | plastic bottle labelled glass |
| plastic159.jpg | glass bottle labelled plastic |

Other cross-class pairs showed different objects and were kept.

**Known limitation:** this only catches label errors that happen to have a
copy in another class. A mislabelled image with no copy is not detected.
Some label noise should be assumed.

## Split

- 70 / 15 / 15 train / val / test, stratified per class, made **before**
  any augmentation.
- Group-aware: whole duplicate groups move together, so ratios are
  approximate rather than exact.
- Reproducible: fixed seed (42), sorted inputs, `processed/` rebuilt from
  scratch on every run, and a `manifest.csv` recording each file's split
  and group id. The script also checks that no group spans two splits.
- Total after cleaning: 6568 images in 6461 groups.

| Class | Train | Val | Test | Total |
| --- | ---: | ---: | ---: | ---: |
| GLASS | 1407 | 302 | 301 | 2010 |
| PAPER | 1359 | 291 | 291 | 1941 |
| ORGANIC | 689 | 148 | 148 | 985 |
| PLASTIC | 605 | 130 | 129 | 864 |
| METAL | 538 | 115 | 115 | 768 |
| **All** | **4598** | **986** | **984** | **6568** |

Every class is far above the 200 images-per-class minimum.

## Class balance

| Class | Images | Share of dataset |
| --- | ---: | ---: |
| GLASS | 2010 | 30.6% |
| PAPER | 1941 | 29.6% |
| ORGANIC | 985 | 15.0% |
| PLASTIC | 864 | 13.2% |
| METAL | 768 | 11.7% |

The largest class (GLASS) is about **2.6x** the smallest (METAL). This is a
mild-to-moderate skew, not an extreme one.

**Why it happens:** GLASS merges three source folders and PAPER merges two,
while PLASTIC, METAL and ORGANIC each come from one. The imbalance is a
direct result of the class mapping in ADR 0002.

**Why it matters:** with no correction, the model sees much less METAL and
PLASTIC than GLASS and PAPER, and tends to favour the big classes. Overall
accuracy would look good while METAL recall quietly suffers.

## Imbalance strategy

1. **Class weights in the loss.** Weight = total / (n_classes x class_count),
   computed on the train split only:

   | Class | Train count | Weight |
   | --- | ---: | ---: |
   | GLASS | 1407 | 0.65 |
   | PAPER | 1359 | 0.68 |
   | ORGANIC | 689 | 1.33 |
   | PLASTIC | 605 | 1.52 |
   | METAL | 538 | 1.71 |

   A METAL mistake therefore costs about 2.6x a GLASS mistake during
   training.
2. **Stratified split.** Each class is split on its own, so val and test
   keep every class represented in proportion.
3. **Augmentation on train only.** Flips, rotations and brightness changes
   are applied to the train split. Val and test stay untouched.
4. **No resampling for now.** Oversampling and undersampling are held back.
   If METAL or PLASTIC recall is weak after the first training run, they
   are the next thing to try, and this section gets updated.
5. **Evaluate per class, not by accuracy alone.** Report per-class
   precision and recall, a confusion matrix, and macro-F1. Val and test keep
   the natural imbalance, so plain accuracy flatters GLASS and PAPER.

**Test-set size caveat:** METAL has 115 test images. At a recall near 90%,
the 95% confidence interval is roughly plus or minus 5-6 points, so
differences of 2-3 points between models are within noise.

## Reproduce

```powershell
python apps/ml/scripts/count_images.py          # raw counts per folder
python apps/ml/scripts/find_duplicates.py apps/ml/data/raw 5   # report only
python apps/ml/scripts/make_split.py            # builds apps/ml/data/processed/
```
