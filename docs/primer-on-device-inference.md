# Primer: What on-device inference buys you, and what it costs

## Start here: what is inference?

A model has two lives.

- **Training** is school. The model looks at thousands of labelled photos and learns.
- **Inference** is the job. The model has finished learning, and now we show it a
  new photo and ask, "what is this?"

In FieldLens, inference is the moment a field worker points the camera at a bottle
and the app says "GLASS".

The only question this primer answers: **where does that moment happen?**

1. **In the cloud.** The app sends the photo to a server. The server runs the model
   and sends the answer back.
2. **On the device.** The model lives inside the app. The phone does the thinking
   itself, and the photo never leaves it.

FieldLens runs on the device. Here is what that gives us, and what we pay for it.

---

## What it buys us

### 1. Speed (latency)

A cloud prediction is a round trip. The photo goes up over the network, waits for a
server, gets processed, and the answer comes back down. Every step can be slow, and
we do not control the network. On weak mobile data, one prediction can take seconds.

On the device there is no trip. The phone already has the photo and the model, so
the answer comes back in tens of milliseconds. That is what makes live camera
classification feel instant instead of laggy.

> Think of asking a friend sitting next to you, instead of posting a letter to a
> friend in another city.

### 2. Privacy

With cloud inference, every photo leaves the phone. A field worker might be photographing
a factory floor, a customer's site or a private yard. Sending that to a server means
we must store it safely, secure it, and explain it to users.

With on-device inference the photo stays on the phone. We cannot leak what we never
receive. For many users and companies, that is a feature on its own.

### 3. It works offline

Sorting waste does not always happen where there is signal: basements, warehouses,
remote sites, or a demo in aeroplane mode. A cloud model simply stops working
without internet. An on-device model does not care.

This is also why our headline demo works with the network switched off. A cloud
model could not do that demo at all.

### 4. Cost

A cloud model costs money for every prediction, because someone has to run the server
and the GPUs. At 10 test devices that is almost nothing. At 10,000 devices each
taking dozens of photos a day, the bill grows with every user.

On-device, the user's own phone does the computing, so our cost per prediction is
about zero. The cost does not vanish, though. It moves: we pay once in engineering
effort to shrink the model and ship it (see below), and users pay a little battery.

---

## What it costs us

### 1. Model size

The model is shipped inside the app, so it adds to the download size. It also has
to fit in the phone's memory next to everything else. This is why we do not use a
giant model. We use small, phone-friendly ones like MobileNetV3 or EfficientNet-Lite,
which are a few megabytes after compression (quantization), not hundreds.

### 2. An accuracy ceiling

Small models are less powerful than the huge ones that run on cloud GPUs. There is a
limit to how accurate a model can be when it must be small and fast enough for a phone.
We accept a slightly lower ceiling in exchange for speed, privacy and offline use.

Shrinking the model further (quantization) can also cost a little accuracy. We must
measure this, not assume it is zero.

### 3. Update friction

In the cloud, we fix or improve the model once on the server, and every user gets it
immediately. On-device, the model sits on thousands of phones. A better model means
shipping it again: through an app update, or by downloading a new model file in the
background. We also have to make sure old and new versions do not break each other,
and have a way to roll back a bad model. FieldLens will handle this with a model
lifecycle service in Day 15.

### 4. The device is not ours

Phones differ a lot. A model that runs smoothly on a new phone may crawl on a cheap
one, and it uses battery and heat. We have to test on real, modest hardware, and use
the phone's accelerators (hardware delegates) well.

---

## Side by side

| | On-device (what FieldLens does) | Cloud |
| --- | --- | --- |
| Speed | Tens of milliseconds, no network | Network round trip, often 100 ms to seconds |
| Privacy | Photo stays on the phone | Photo is sent to a server |
| Offline | Works | Does not work |
| Cost per prediction | About zero for us | Paid every time |
| Model size | Must be small (a few MB) | Can be huge |
| Accuracy ceiling | Lower | Higher |
| Updating the model | Needs a rollout to every phone | Update once on the server |

## Why FieldLens chose on-device

Our users work in the field, often with bad or no signal, and photograph places they
may not want uploaded. A waste-type classifier with five classes is a task a small
model can do well. So the things we gain (speed, privacy, offline) matter a lot to
us, and the things we give up (a lower accuracy ceiling, update friction) are
manageable for a five-class problem.

If the task were very hard, such as identifying thousands of object types, the answer
could change. A hybrid is also possible: a small model on the phone for the easy
cases, and the cloud only for the hard ones.

## Quick self-check

If you can answer these without looking, you understand this primer:

1. Why does cloud inference get slower on a bad network, and on-device does not?
2. Who pays for the computing in each approach?
3. Name two reasons we cannot just put the biggest, most accurate model in the app.
4. What is hard about improving an on-device model after release?
