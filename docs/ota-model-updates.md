# Over-the-air (OTA) model updates

The app can get a newer classification model from the server without being
reinstalled. This page explains how it works and how to publish a new model.

## What it does

When the user is signed in, the app asks the API for the latest production
model. If that version is newer than the model the phone already uses, the app
downloads it and starts using it. The next photo is classified with the new
model.

The model that ships inside the app (the "bundled" model) is version `1.0.0`.
A server model must have a higher version number to be installed.

## How it works

1. The app calls `GET /models/latest?platform=android` (or `ios`). The answer
   has the `version`, `size_bytes` and `sha256` of the model.
2. The app compares the server version with the version it uses now. Versions
   are compared as numbers, so `1.10.0` is newer than `1.9.0`. If the server
   version is not newer, nothing happens.
3. The app downloads the file with `GET /models/<version>/download`.
4. The app checks the file size and the SHA-256 checksum against step 1.
5. The file is first written as `fieldlens_<version>.tflite.part`, checked
   again, and only then renamed to `fieldlens_<version>.tflite`.
6. The new version number is saved. From this moment the new model is active.
7. Model files from older updates are deleted.

The check runs when the user signs in, and when the app starts with a saved
login. Only one check runs at a time.

## Why it is safe

- **Bad download:** if the size or checksum is wrong, the file is thrown away.
  The model that was working keeps working. The app only prints
  `Model update check failed; keeping the current model`.
- **Broken model file:** if the downloaded model cannot be loaded or run, the
  app falls back to the bundled model for that photo, so classification still
  works.
- **Half-finished download:** the `.part` file is never used. The version is
  saved only after the final rename, so the app never points to a missing file.
- **No internet:** the update check fails quietly and the model already on the
  phone is used. Classification and saving inspections work offline.

## How to publish a new model

1. Upload the `.tflite` file to the ML service (`POST /models`) with a new
   version number that is higher than the current production version.
2. Check the metadata in the answer: `accuracy`, `quantization`, `platforms`.
3. Change its status from `draft` to `staged`, then to `production`
   (`PATCH /models/<version>/status`).
4. Phones get the model the next time they sign in or start with a saved login.

Only one model is `production` at a time.

## How we tested it

On a Samsung Galaxy A17 with a real server:

| Test | Result |
|---|---|
| Fresh install: model `1.1.0` is downloaded and shown in Settings | Pass |
| Restart the app: update check runs, nothing is downloaded again | Pass |
| Unreadable model file: app falls back to the bundled model | Pass |
| Wrong checksum: download is rejected, app keeps working | Pass |
| Publish `1.2.1`: phone shows `1.2.1` after restart, no reinstall | Pass |
| Internet off: app opens, classifies and saves, version stays `1.2.1` | Pass |

The active model version is shown in **Settings**.

## Limits

- **No downgrade.** Only a newer version is installed. If we move the
  `production` label back to an older model on the server, phones that already
  have the newer one keep it. To undo a bad model, publish a fixed model with a
  higher version number.
- **The checksum comes from the same server as the file.** It protects against
  broken downloads, not against a server that is attacked. We rely on HTTPS and
  on a signed-in user for that.
- **No test run of the new model before it is used.** A model that loads but
  gives bad answers would be used. The accuracy check is done before
  publishing (see `docs/benchmark.md`).
