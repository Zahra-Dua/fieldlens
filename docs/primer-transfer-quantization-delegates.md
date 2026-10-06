# Primer: Transfer learning, quantization and hardware delegates

Three ideas, one pipeline. This is how FieldLens gets a small, fast waste
classifier onto a phone:

1. **Transfer learning** gives us a model that is accurate even though we only
   have about 4,600 training photos.
2. **Quantization** shrinks that model so it fits in an app and runs fast.
3. **Hardware delegates** decide which chip on the phone does the work.

Read them in order. Each one sets up the next.

---

## Part 1: Transfer learning

### The idea

Imagine two new hires who must sort waste by sight.

- **Person A** has never seen anything. You have to teach them what an edge is, what
  a shiny surface looks like, what a curve is, and only then what a bottle is.
- **Person B** is an experienced worker who already recognises shapes, textures and
  everyday objects. You only have to teach them *your* five categories.

Person B learns in an afternoon. Person A needs years.

Transfer learning means starting from Person B. We take a model that was already
trained on **ImageNet** (about 1.2 million photos, 1,000 everyday categories) and
teach it only our five classes: PLASTIC, GLASS, METAL, PAPER, ORGANIC.

### Why not train from scratch on our photos?

**1. It memorises instead of learning (overfitting).**
A phone-sized model still has millions of numbers (parameters) to adjust. With only
a few thousand photos, it can simply memorise the training images. Training accuracy
looks perfect, and then it fails on photos it has never seen.

**2. It cannot learn the basics well from so little data.**
A vision model learns in layers:

- early layers learn simple things: edges, corners, colour patches
- middle layers combine them into textures and shapes
- late layers recognise whole objects

Those early layers need a huge variety of images to become good. A few thousand waste
photos are not enough variety. ImageNet is.

**3. It wastes time and money.**
Training from scratch takes far more compute. On a free Colab GPU, starting from a
pretrained model takes minutes.

### How we do it: two stages

Our notes sometimes say "freeze everything and train only the last layer". That is
stage one. Fine-tuning has a second stage.

1. **Train the head.** Keep the pretrained layers frozen (not changed). Replace the
   last layer with a new one that has 5 outputs, and train only that. Fast, safe.
2. **Fine-tune (optional).** Unfreeze the last few pretrained layers and train them
   very gently, with a small learning rate. This lets the model adjust its
   high-level knowledge to waste photos. A large learning rate here would wreck
   what it already knows.

### Why MobileNetV3 or EfficientNet-Lite?

Because they were built for phones, not data centres.

- **MobileNetV3** was designed with phone speed in mind, using clever lightweight
  building blocks and an architecture search that targeted mobile hardware.
- **EfficientNet-Lite** is a version of EfficientNet changed to work well on phone
  CPUs and with quantization (some parts that quantize badly were removed).

Both are small (a few million parameters), quick, and both have pretrained ImageNet
versions we can download. Small + pretrained is exactly what we need.

---

## Part 2: Quantization

### The idea

A trained model is just a very large pile of numbers (weights). By default each one
is stored as a **float32**: a decimal number using 32 bits (4 bytes), with lots of
precision.

Quantization means storing those numbers with fewer bits. It is like measuring a
table in centimetres instead of millimetres: slightly less exact, but much cheaper to
write down and add up, and for our purposes still accurate enough.

### The three formats

| Format | Bits per number | Size of a 5-million-parameter model | What to know |
| --- | ---: | ---: | --- |
| float32 | 32 | about 20 MB | The original. Full precision. |
| float16 | 16 | about 10 MB | Half the size, almost no accuracy loss. |
| int8 | 8 | about 5 MB | A quarter of the size, usually the fastest on phones, small accuracy risk. |

Two honest notes:

- float16 mainly saves **size**. It makes things faster only on hardware that likes
  16-bit numbers, such as a phone GPU. Do not assume it is twice as fast everywhere.
- int8 is where the big speed and size wins are, and also where accuracy can slip,
  so we must **measure it**, not assume it is fine.

### How int8 works (the simple version)

int8 can only hold 256 different values (whole numbers from -128 to 127). To fit
decimals into that, each tensor gets two helper numbers:

- a **scale**: how big one step is
- a **zero point**: which integer stands for zero

Then `real value = scale × (stored integer − zero point)`. The decimals are squeezed
onto a 256-step ruler. The ruler has to cover the right range, or values get
clipped or everything lands on a few steps and detail is lost.

### Post-training quantization (PTQ)

"Post-training" means we quantize **after** the model is fully trained, with no
retraining. We take the finished float32 model and convert it. That is why it is so
convenient. (The alternative, quantization-aware training, trains the model while
simulating low precision. It can recover more accuracy but costs more work. We start
with PTQ.)

TensorFlow Lite offers a few PTQ styles:

| Style | What gets quantized | Needs sample data? |
| --- | --- | --- |
| Float16 | weights to 16-bit | No |
| Dynamic range | weights to int8, activations handled on the fly | No |
| Full integer (int8) | weights and activations, fully int8 | **Yes** |

Full integer int8 is the one that runs fastest on phones and works on integer-only
chips, so it is our target. And it is the one that needs a representative dataset.

### What is a representative dataset, and why do we need one?

A model has two kinds of numbers:

- **Weights**: fixed, stored in the file. The converter can look at them and pick a
  good ruler (scale and zero point) directly.
- **Activations**: the numbers that flow *between* layers while the model is running
  on an actual photo. These depend on the input, so the converter cannot know their
  range just by looking at the model.

To build a good ruler for activations, the converter needs to see typical numbers.
So we give it a small set of real images and it runs them through the model,
recording the minimum and maximum values at each layer. This step is called
**calibration**, and that small set of images is the **representative dataset**.

What happens without one, or with a bad one?

- No representative dataset: full int8 conversion cannot pick activation rulers.
- Unrepresentative data (say, only plastic photos, or blank images): the rulers are
  wrong for real use, values get clipped, and accuracy drops, sometimes badly.

Rules of thumb for FieldLens:

- Use about **100 to 500 images** drawn from the **train** split, covering all five
  classes.
- **Never use test images** for calibration. The test set must stay unseen so our
  final accuracy number is honest.
- No labels are needed. The converter only watches the numbers.

### The check we must always do

After converting, run the int8 model on the **test split** and compare it to the
float32 model, class by class. Write down the accuracy drop and the model size. If
METAL recall falls noticeably, we try a better calibration set, float16, or
quantization-aware training.

---

## Part 3: Hardware delegates

### The idea

A phone has several kinds of processors. By default, a model runs on the **CPU**,
the general-purpose one. Other chips are specialised: they do the maths a neural
network needs much faster, or with much less battery.

A **delegate** is the piece of software that hands the model's work to a different,
better-suited chip. Think of a manager giving each task to the right specialist.

If a delegate cannot run some operation in the model, that part falls back to the
CPU, so the model still works, just slower.

### The four we need to know

| Delegate | Where | Runs on | In one line |
| --- | --- | --- | --- |
| **XNNPACK** | Android, iOS, desktop | CPU | A highly tuned CPU library. The reliable default. |
| **GPU delegate** | Android and iOS | The phone's graphics chip | Great for vision models, since images are big grids of parallel maths. |
| **NNAPI** | Android only | GPU, NPU or DSP, chosen by the phone | Android's built-in route to its accelerators. |
| **Core ML** | iPhone, iPad, Mac | Apple Neural Engine, GPU or CPU | Apple's own framework, the best route on Apple hardware. |

More detail:

- **XNNPACK** is not new hardware. It squeezes the most out of the CPU using
  vector instructions. It works on nearly every phone, and in TensorFlow Lite it is
  the default CPU path. It is our safe baseline.
- **GPU delegate** can speed up image models a lot, especially float models. Some
  operations may not be supported, and it can use more power than a dedicated
  AI chip.
- **NNAPI** lets the Android system pick the best accelerator for the phone's chip
  (Qualcomm, MediaTek, Google Tensor, and so on). Results vary a lot between
  phones and manufacturers' drivers. Note that Google has been moving away from
  NNAPI in newer Android versions, so check the current LiteRT documentation before
  relying on it.
- **Core ML** is how iOS gets the Neural Engine. It is the right choice on iPhones
  because it is built into Apple's chips and is very battery efficient.

### Why delegates and quantization go together

Many accelerators (NPUs, DSPs, Edge TPUs) only work with **int8** models, or are
fastest with them. So quantizing is often what *unlocks* the fast hardware, not just
a way to save space.

### What we do in FieldLens

Do not guess which delegate is fastest. Measure it on a real phone: the same model,
with the CPU (XNNPACK), the GPU delegate, and NNAPI on Android, comparing latency per
photo. Phones differ enough that the winner can change from device to device. We keep
a safe CPU fallback so the app always works.

---

## The whole pipeline in one picture

```
ImageNet-pretrained MobileNetV3 / EfficientNet-Lite
        |   transfer learning (our 4,598 training photos)
        v
FieldLens model, float32  (accurate, biggest)
        |   post-training quantization
        |   (representative dataset: ~100-500 TRAIN images)
        v
int8 .tflite model  (about 4x smaller)
        |   check accuracy on the TEST split
        v
Runs on the phone through a delegate
(XNNPACK / GPU / NNAPI on Android, Core ML on iOS)
```

## Cheat sheet

| Term | Plain meaning |
| --- | --- |
| Transfer learning | Start from a model that already knows how to see |
| Fine-tuning | Gently adjust the last pretrained layers for our task |
| Quantization | Store the numbers with fewer bits |
| PTQ | Do it after training, with no retraining |
| Representative dataset | A small set of real images used to calibrate int8 |
| Delegate | A bridge that sends the model's work to a faster chip |

## Quick self-check

1. Why does training from scratch on a few thousand photos tend to overfit?
2. What is the difference between "train the head" and "fine-tune"?
3. By roughly how much does int8 shrink a float32 model?
4. Why can the converter work out the weight ranges alone but not the activation
   ranges?
5. Why must the representative dataset come from the train split and not the test
   split?
6. Why can quantizing to int8 make a model faster on some chips, beyond saving space?
7. If a delegate cannot run part of the model, what happens?
