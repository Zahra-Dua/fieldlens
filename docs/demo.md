**Screen recording (backup):** [FieldLens demo video](https://drive.google.com/file/d/1z_xX1Qr2bZd2_07WXqhkDx0G3VcBHa3D/view?usp=drive_link)

# FieldLens demo script

A 5 to 8 minute demo of the whole system on a real Android phone and the web dashboard.

The story: **a field worker inspects waste with no internet, the result reaches the dashboard later, and the admin sends the phone a better model without reinstalling the app.**

```
login → capture → offline inference (aeroplane mode) → reconnect and sync
      → dashboard shows it → promote a new model → app picks it up
```

Times below are targets. Total: about 7 minutes.

## 1. Before you start (preparation)

Do this about 15 minutes before. Never prepare on camera.

### Server

```bash
docker compose up -d
docker compose ps                     # api, ml, db, minio healthy
```

First time on this machine only:

```bash
docker compose run --rm migrate npx tsx prisma/seed.ts          # users + 20 inspections
docker compose run --rm migrate npx tsx prisma/seed-demo.ts     # 120 more, so charts look full
```

### Phone

- Android phone connected with a USB cable, USB debugging on.
- Use a **profile or release build**, because debug builds are slow and make inference look bad:
  ```bash
  cd apps/app
  flutter run --profile --dart-define-from-file=env/dev.json
  ```
  `env/dev.json` has `API_BASE_URL=http://localhost:3000`.
- Open the tunnel from the phone to the API:
  ```bash
  adb devices
  adb reverse tcp:3000 tcp:3000
  ```
- Turn on Do Not Disturb, set brightness high, charge above 50 percent.
- Sign out of the app, so the demo starts at the login screen.
- Open **Settings** once and write down the current model version: **`____`** (call it version A).

### Models (the most important preparation)

The final step promotes a new model. It must be **already uploaded and staged**, with a version **higher than version A**.

1. Open the dashboard, **Models**, and check that one row is `staged` with a version higher than A (for example `1.3.0`).
2. If there is none: upload a model file with a higher version. Use a different variant from the current one (for example `dynamic_range`), then click **Stage**.
3. Every rehearsal uses up one version, because versions only go up and a phone never goes back to an older one. **Stage 3 or 4 spare versions** (for example `1.3.0`, `1.3.1`, `1.3.2`) so you can rehearse and still have a fresh one for the real run.

### Browser

- Chrome tab 1: the dashboard at http://localhost:5173, logged in as `admin@fieldlens.dev`, on **Overview**.
- Chrome tab 2: **Models**.
- The green **Live** light in the header must be on.

### Photos

- Item 1: something the model knows well, such as a plastic bottle or a metal can.
- Item 2: a second item for the offline step. A different class is nicer.
- Optional: one hard item (crumpled paper, clear plastic) that gives a low-confidence answer, to show the correction step.

### Recording

- Record the phone screen (Android screen recorder) and the PC screen (OBS or `Win + G`). Do a 1-minute test recording first and check the sound.
- If you give this live (the presentation), skip recording. The recording is the backup.

## 2. The script

Each step has **Do**, **Say** (in your own words) and **Check** (what must be true before you move on).

### Step 1. Login (0:30)

- **Do:** On the phone, log in as `worker@fieldlens.dev` / `Password123!`. Then open **Settings** and show the model version (version A).
- **Say:** "This is FieldLens. A field worker logs in on the phone. The app is using model version A. Remember this number."
- **Check:** Capture screen opens. Settings shows version A.

### Step 2. Capture and classify (1:00)

- **Do:** Photograph item 1 with the camera. (You can also use the gallery button to pick an existing photo.) Wait for the result. Show the label and the confidence. Choose **Save inspection**. Open the **History** screen.
- **Say:** "The photo is classified on the phone, not on a server. The model is a small MobileNet. The result has a label and a confidence number. Below 60 percent the app says it is uncertain and asks the worker to confirm."
- **Check:** The inspection is in History. Because the phone is online, it shows synced in a few seconds.

### Step 3. Go offline: aeroplane mode (1:30)

- **Do:**
  1. Close the tunnel on the PC: `adb reverse --remove tcp:3000`.
  2. Turn **aeroplane mode on** on the phone. Show the icon in the status bar.
  3. Photograph item 2. Show that the label and confidence appear at once. Save it.
  4. Open **History**. Show the new row as **pending**.
- **Say:** "Now there is no internet at all. The model runs inside the phone, so I still get an answer. The inspection is saved in a local database and waits in an outbox. Nothing is lost."
- **Check:** The row is pending, and the app did not crash or show a network error.
- **Why step 1 matters:** the USB tunnel works even in aeroplane mode. If you leave it open, the phone can still reach the API and sync, and the demo is not really offline. Closing it makes the phone truly offline.

### Step 4. Reconnect and sync (1:00)

- **Do:**
  1. Open the tunnel again: `adb reverse tcp:3000 tcp:3000`.
  2. Turn **aeroplane mode off**.
  3. Wait a few seconds. If nothing happens, tap **Sync now**.
  4. Show the row change from pending to **synced**.
- **Say:** "When the connection comes back, the sync engine sends the outbox to the server. It is safe to retry, because every inspection has its own ID and the server does an upsert. The same inspection can never be created twice."
- **Check:** The row is synced.

### Step 5. The dashboard shows it (1:00)

- **Do:** Switch to the browser. Go to **Inspections**. The new inspections are at the top (sorted newest first). Open the offline one to show its photo, label and confidence. Go back to **Overview** and point at the charts. Open **Devices** and show the phone, its model version and its last-seen time.
- **Say:** "The admin dashboard shows it. The green Live light means the server pushes new inspections over Server-Sent Events, so I do not need to refresh. The Devices page shows which phone is on which model version."
- **Check:** The offline inspection is visible. Devices shows the phone on version A.
- **Optional (30 s):** If you corrected a label in the app, open **Review Queue**. Show the row with the original and corrected label. Click **Export CSV**. Say: "This is the feedback loop. Corrections become labelled data for the next model."

### Step 6. Promote a new model (1:00)

- **Do:** Open **Models**. Show the table: version A is `production`, the new version is `staged`. Promote the staged version to production, and **confirm** in the dialog. Show the table update.
- **Say:** "A new model was trained and uploaded earlier. It went draft, then staged. Now I promote it to production. There is a confirmation step, because this changes what every phone will use. Only one model is production at a time."
- **Check:** The new version is `production`.

### Step 7. The app picks it up (1:00)

- **Do:** On the phone, close the app and open it again (or sign out and sign in). Open **Settings** and show the new version. Photograph item 1 again and save it.
- **Say:** "The phone asks the server for the latest production model when the app starts. The new version is newer, so the app downloads it, checks the size and the SHA-256 checksum, and switches to it. There was no reinstall and no app store."
- **Check:** Settings shows the new version, not version A. Classification still works.
- **Bonus:** Show the new inspection on the dashboard.

### Step 8. Wrap up (0:20)

- **Say:** "So: capture and classify with no internet, sync later without duplicates, watch it live on a dashboard, and ship a better model to the phones with one click."

## 3. If something goes wrong

| Problem | What to do |
| --- | --- |
| Step 3: the row syncs even in aeroplane mode | You forgot `adb reverse --remove tcp:3000`. Run it, and repeat step 3 with item 2 again. |
| Step 4: the row stays pending | Tap **Sync now**. If it still fails, check `adb reverse tcp:3000 tcp:3000` and `docker compose ps`. |
| Step 5: dashboard does not show the new row | Refresh the page once. Check the Live light. Check that you are logged in as the admin. |
| Step 6: no `staged` version to promote | You did not prepare one. Upload a model with a higher version, stage it, then promote. |
| Step 7: Settings still shows version A | The new version is not higher than the phone's, or the update check did not run. Close the app completely and reopen it. Check `docker compose logs api --since 2m`. |
| The app says it can not reach the server | Run `adb devices`, then `adb reverse tcp:3000 tcp:3000`. |
| Docker is not running | Start Docker Desktop and run `docker compose up -d`. |

## 4. After the demo, to repeat it

- On the phone, sign out. Delete the demo inspections if you want a clean history.
- In the dashboard, check that a **new staged version** (higher than the one now in production) is ready.
- Re-open the tunnel: `adb reverse tcp:3000 tcp:3000`.
