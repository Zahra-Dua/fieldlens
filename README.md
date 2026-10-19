# FieldLens

FieldLens is an offline-first waste inspection system.

A field worker takes a photo with the phone. A small model on the phone says what kind of waste it is (glass, metal, organic, paper or plastic). This works with no internet. The result is saved on the phone and sent to the server later, when the phone is online. An admin watches the results on a web dashboard, fixes labels, and sends better models back to the phones.

```
photo → model on the phone → saved locally → synced to the API → dashboard
                                                  ↑
                      new model: upload → stage → promote → phones update
```

## Contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Quick start (one command)](#quick-start-one-command)
4. [Run the mobile app](#run-the-mobile-app)
5. [Develop each app without Docker](#develop-each-app-without-docker)
6. [Environment variables](#environment-variables)
7. [Run the tests](#run-the-tests)
8. [API overview](#api-overview)
9. [Train and deploy a new model](#train-and-deploy-a-new-model)
10. [The feedback loop (review queue)](#the-feedback-loop-review-queue)
11. [Docker and CI](#docker-and-ci)
12. [More documentation](#more-documentation)
13. [Known limitations](#known-limitations)
14. [Troubleshooting](#troubleshooting)

## Architecture

```mermaid
flowchart LR
  subgraph Phone["Flutter app (Android)"]
    CAM["Camera or gallery photo"] --> TFL["On-device model (TFLite)"]
    TFL --> LDB[("Local database + outbox")]
  end

  subgraph Server["Docker stack"]
    API["Node API (Fastify)"] --> PG[("PostgreSQL")]
    API --> MINIO[("MinIO: images")]
    API -- "model requests" --> ML["ML service (FastAPI)"]
    ML --> MODELS[("Model files + registry")]
  end

  WEB["React dashboard (admin)"] --> API
  API -- "live updates (SSE)" --> WEB
  LDB -- "sync when online" --> API
  API -- "GET /models/latest, download" --> Phone
```

| Part | Folder | What it does |
| --- | --- | --- |
| Mobile app | `apps/app` | Flutter. Takes a photo (camera or gallery), classifies it on the phone, saves it locally, syncs it when online, and updates its model over the air. |
| API | `apps/api` | Node.js, TypeScript, Fastify, Prisma. Login, devices, inspections, image upload, model endpoints, dashboard queries, live updates. |
| ML service | `apps/ml` | Python, FastAPI. Keeps the model registry (draft, staged, production), stores model files, and classifies photos as a cloud fallback. |
| Web dashboard | `apps/web` | React, TypeScript, Vite, Tailwind. Admin only: charts, inspection table, review queue, devices, model management. |
| Database | PostgreSQL 16 | Users, devices, inspections, predictions, model versions. |
| Image storage | MinIO | The inspection photos (S3-compatible). |

### How the main flows work

- **Offline first.** Every inspection is saved on the phone first, in a local database. A separate outbox table keeps what is not synced yet. A sync engine sends it when there is a connection, and it can retry safely because each inspection has a client-made UUID and the API does an upsert (ADR 0005, 0011, 0013).
- **Classification.** The model runs on the phone. If the confidence is below 0.6, the app marks the result as uncertain and asks the user to confirm or correct the label.
- **Over-the-air model updates.** After login (and on app start), the app asks `GET /models/latest`. If the server version is newer, the app downloads it, checks size and SHA-256, and switches to it. It never installs an older version. Details: [docs/ota-model-updates.md](docs/ota-model-updates.md).
- **Model lifecycle.** A model is `draft`, then `staged`, then `production`. Only one model is in production at a time.
- **Live dashboard.** When a new inspection arrives, the API sends an event over Server-Sent Events, and the dashboard refreshes. The header shows a "Live" light.

## Repository layout

```text
fieldlens/
├── apps/
│   ├── api/        Node API, Prisma schema + migrations, API tests
│   ├── app/        Flutter mobile app
│   ├── ml/         ML service, training notebooks, dataset scripts, model files
│   └── web/        React admin dashboard
├── docs/           ADRs, model/OTA docs, benchmark, dataset, Docker, demo, retrospective
├── scripts/        PowerShell helpers (image sizes, image secrets check)
├── .github/        GitHub Actions CI
├── docker-compose.yml
└── .env.example
```

## Quick start (one command)

You need **Docker** (Docker Desktop on Windows or Mac) and **Git**. Nothing else.

```bash
git clone https://github.com/Zahra-Dua/fieldlens.git
cd fieldlens
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up --build
```

The first build takes a few minutes. When every service is `healthy` (check with `docker compose ps`), open:

| What | Address |
| --- | --- |
| Admin dashboard | http://localhost:5173 |
| API docs (Swagger) | http://localhost:3000/docs |
| ML service docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 (user and password from `.env`) |

The database starts empty. In a second terminal, create demo users and sample data (run this **once**):

```bash
docker compose run --rm migrate npx tsx prisma/seed.ts
```

Log in to the dashboard with:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@fieldlens.dev` | `Password123!` |
| Field worker | `worker@fieldlens.dev` | `Password123!` |

Only the **admin** can use the dashboard. These passwords are for local demos only.

Optional: add 120 more demo inspections, so the charts look full:

```bash
docker compose run --rm migrate npx tsx prisma/seed-demo.ts
```

Stop everything with `docker compose down`. To also delete all data (database, images, uploaded models): `docker compose down -v`.

What `docker compose up` starts: `db`, `minio`, `ml`, then a one-time `migrate` job (applies database migrations and exits), then `api`, then `web`. Each service has a healthcheck, and the start order waits for them. More details: [docs/docker.md](docs/docker.md).

## Run the mobile app

The app is built with Flutter and is tested on a real Android phone (Samsung Galaxy A17). The server stack above must be running.

Requirements: the Flutter SDK (Dart 3.13 or newer), and Android Studio or the Android SDK tools.

```bash
cd apps/app
cp env/dev.example.json env/dev.json     # Windows: Copy-Item env/dev.example.json env/dev.json
flutter pub get
flutter run --dart-define-from-file=env/dev.json
```

`env/dev.json` has one value, the API address as the phone sees it. It is not committed.

| You run the app on | Set `API_BASE_URL` to | Extra step |
| --- | --- | --- |
| Android emulator | `http://10.0.2.2:3000` | none |
| Real phone with USB cable | `http://localhost:3000` | run `adb reverse tcp:3000 tcp:3000` (again after you reconnect the cable) |
| Real phone on the same Wi-Fi | `http://<your-pc-ip>:3000` | allow port 3000 in the PC firewall |

Log in as `worker@fieldlens.dev`. The capture screen has a camera button and a gallery button. The gallery button lets you pick an existing photo, for example a test image. **Settings** shows the active model version.

## Develop each app without Docker

Use Docker only for the database and storage, and run the app you are changing on your machine.

```bash
docker compose up -d db minio ml
```

**API** (Node 24):

```bash
cd apps/api
npm install
cp .env.test.example .env.test      # only needed for tests
# Create apps/api/.env with DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# MINIO_ROOT_USER, MINIO_ROOT_PASSWORD (same values as the root .env, host "localhost").
npx prisma generate
npx prisma migrate deploy
npm run seed                         # demo users and data (once)
npm run dev                          # http://localhost:3000
```

**Web** (Node 24):

```bash
cd apps/web
npm install
npm run dev                          # http://localhost:5173
```

The web app calls the API at `VITE_API_URL` (default `http://localhost:3000`). See `apps/web/.env.example`.

**ML service** (Python 3.14, with [uv](https://docs.astral.sh/uv/)):

```bash
pip install uv
cd apps/ml
uv sync
uv run uvicorn app.main:app --reload     # http://localhost:8000
```

## Environment variables

The template is [.env.example](.env.example). Copy it to `.env`. The file `.env` is never committed. Do not put real secrets in `.env.example`.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | db, api | Database login and name. |
| `DATABASE_URL` | api (outside Docker only) | Connection string. Inside Docker, compose builds its own with host `db`. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | api | Two **different** long random strings that sign login tokens. The API refuses to start without them. |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | minio, api | Storage login. The API refuses to start without them. |
| `MINIO_BUCKET` | api | Bucket for inspection images. Default `fieldlens-images`. |
| `ML_SERVICE_URL` | api (outside Docker only) | Where the API finds the ML service. Inside Docker it is `http://ml:8000`. |
| `WEB_ORIGINS` | api | Browser origins allowed by CORS, comma separated. Default `http://localhost:5173`. |
| `VITE_API_URL` | web (build time) | API address as the browser sees it. It is copied into public JavaScript, so never put a secret here. |
| `LOG_LEVEL` | api | `info` by default. |
| `FIELDLENS_ML_DATA` | ml | Folder for uploaded models and the registry. `/data` in Docker. |
| `API_BASE_URL` | Flutter app | Passed with `--dart-define-from-file` (see above). |
| `DB_PORT`, `API_PORT`, `ML_PORT`, `WEB_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT` | compose | Optional. Change the host ports if something else uses them. |

Make a random secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Run the tests

| App | Commands (run inside the app folder) |
| --- | --- |
| API | `npm test`, `npm run lint`, `npm run build` |
| ML | `uv run pytest` |
| Web | `npm test`, `npm run lint`, `npm run format:check`, `npm run build` |
| Mobile | `flutter analyze`, `flutter test` |

The **API tests use a real PostgreSQL and a real MinIO**, not mocks. They use a separate database so they never touch your dev data. One-time setup:

```bash
docker compose up -d db minio
docker compose exec db psql -U fieldlens -c "CREATE DATABASE fieldlens_test;"
cd apps/api
cp .env.test.example .env.test
```

Then apply the migrations to the test database (the URL is the one in `.env.test`):

```bash
# bash
DATABASE_URL="postgresql://fieldlens:change_me_locally@localhost:5432/fieldlens_test?schema=public" npx prisma migrate deploy
# PowerShell
$env:DATABASE_URL="postgresql://fieldlens:change_me_locally@localhost:5432/fieldlens_test?schema=public"; npx prisma migrate deploy
```

Use your own `POSTGRES_PASSWORD` in the URL if you changed it. After that, `npm test` works.

**CI.** Every pull request runs GitHub Actions (`.github/workflows/ci.yml`): lint, tests and build for all four apps, plus a Docker image build. Path filters run only the apps whose files changed. The last job, `ci-ok`, fails if any job failed.

## API overview

Full, live documentation: http://localhost:3000/docs (JSON: `/docs/json`). Short map:

| Area | Routes | Who |
| --- | --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | public / logged in |
| Devices | `POST /devices/register`, `GET /devices` | logged in |
| Inspections | `POST /inspections`, `GET /inspections` (filter, sort, page), `GET /inspections/:id`, `DELETE /inspections/:id` | logged in (delete: admin) |
| Images | `POST /inspections/:id/images`, `GET /inspections/:id/images/:imageId` | logged in |
| Dashboard | `GET /inspections/stats`, `GET /inspections/devices` | logged in |
| Review queue | `GET /inspections/review-queue`, `GET /inspections/review-queue/export` (CSV) | logged in |
| Live updates | `GET /inspections/events` (Server-Sent Events) | admin |
| Models (phones) | `GET /models/latest?platform=android`, `GET /models/:version/download` | logged in |
| Models (admin) | `GET /models`, `POST /models` (upload), `POST /models/:version/stage`, `POST /models/:version/promote` | admin |
| Health | `GET /health` | public |

A field worker only sees their own inspections. An admin sees all of them. Login is rate limited. Access tokens last 15 minutes. Refresh tokens last 7 days and rotate on every use.

## Train and deploy a new model

### 1. Train (Google Colab, notebooks in `apps/ml/notebooks`)

The dataset is the Kaggle "Garbage Classification" set (ODbL licence). 8 source folders are mapped to 5 classes. See [docs/dataset.md](docs/dataset.md).

1. Download the raw dataset into `apps/ml/data/` (it is git-ignored).
2. Build the clean, group-aware split (removes near-duplicate leakage, seed 42, 70/15/15):
   ```bash
   python apps/ml/scripts/make_split.py
   ```
3. Zip `apps/ml/data/processed` and upload it to Google Drive as `MyDrive/fieldlens/processed.zip`.
4. In Colab (GPU runtime: T4), run `01_dataset_setup.ipynb` to check the data arrives intact, then `02_train_and_convert.ipynb`. It trains MobileNetV3-Small in two stages, evaluates once on the test set, converts to four TFLite variants (float32, float16, int8, dynamic range), and verifies each one.
5. Download the `.tflite` files, `model_card.md` and `results.csv` from `MyDrive/fieldlens/models/` into `apps/ml/models/`.
6. Read `model_card.md`. It records the input contract: `[1, 224, 224, 3]` float32, RGB, raw 0 to 255, resized straight to 224x224 with no crop. The app must follow this exactly.
7. Pick the variant. Production uses **float16** (ADR 0014). Full int8 lost about 10 accuracy points, so it is not used. Benchmark: [docs/benchmark.md](docs/benchmark.md).

### 2. Deploy (no app reinstall needed)

In the dashboard, open **Models**:

1. **Upload** the `.tflite` file. Give it a **new version** that is higher than the current production version (for example `1.3.0`), the platforms, the quantization, the test accuracy (0 to 1) and notes. It starts as `draft`.
2. Click **Stage**. Then click **Promote to production** and confirm.
3. Phones get it the next time the user signs in or starts the app with a saved login. In the app, **Settings** shows the new version.

The same steps with the API (admin token in `$TOKEN`):

```bash
curl -H "Authorization: Bearer $TOKEN" -F version=1.3.0 -F platforms=android -F platforms=ios \
     -F quantization=float16 -F accuracy=0.916 -F notes="retrained" -F file=@fieldlens_float16.tflite \
     http://localhost:3000/models
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/models/1.3.0/stage
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/models/1.3.0/promote
```

Rules: the version must be higher than what phones already have, and there is no downgrade. To undo a bad model, publish a fixed one with a higher version number.

Two fallback models exist: the app ships a bundled model (`apps/app/assets/models/fieldlens_float16.tflite`, version `1.0.0`), and the ML service ships `apps/ml/models/fieldlens_float32.tflite` for cloud `/predict` until a model is promoted.

## The feedback loop (review queue)

When a worker corrects the model's label, the correction is synced with the inspection. In the dashboard, **Review Queue** lists every inspection where the label was corrected. You can filter it by labels, confidence, device and date, and **export it as CSV**.

CSV columns: `predictionId, inspectionId, capturedAt, predictedClass, correctedClass, confidence, reviewStatus, deviceName, devicePlatform, deviceId, userName, userEmail`.

`correctedClass` is the human label to use for retraining. The CSV has the inspection ID, not the image. Download an image with `GET /inspections/:id/images/:imageId`. Retraining with this data is a manual step today (see limitations).

## Docker and CI

- Multi-stage Dockerfiles for `api`, `ml` and `web`. Dependency files are copied first, so a code change does not reinstall dependencies. All containers run as a non-root user.
- Image sizes before and after multi-stage builds: api 658 to 174 MB, ml 495 to 110 MB, web 493 to 25 MB.
- No secrets in images. Check it with `scripts/check-image-secrets.ps1` (it looks in layer history, image config and every file).
- Full notes and numbers: [docs/docker.md](docs/docker.md).

## More documentation

| Document | What it covers |
| --- | --- |
| [docs/adr](docs/adr) | Architecture decisions, with dates. |
| [docs/docker.md](docs/docker.md) | Docker, compose, CI, image sizes. |
| [docs/ota-model-updates.md](docs/ota-model-updates.md) | Over-the-air model updates. |
| [docs/dataset.md](docs/dataset.md) | Dataset, cleaning, split. |
| [docs/benchmark.md](docs/benchmark.md) | On-device speed and accuracy. |
| [apps/ml/models/model_card.md](apps/ml/models/model_card.md) | Model facts and input contract. |
| [docs/schema-sketch.md](docs/schema-sketch.md) | First database sketch. |
| docs/demo.md | Step-by-step demo script. |
| docs/retrospective.md | What we learned. |

## Known limitations

- **Five classes only.** The model always picks one of the five, even for batteries, clothes or mixed items. Low confidence (below 0.6) is the only warning.
- **The accuracy number is from web photos.** 91.8 percent accuracy is on the held-out part of a Kaggle dataset. Real photos from the field will probably score lower. The review queue is how we measure that.
- **Tested on one Android phone** (Samsung Galaxy A17). iOS permissions are in place but iOS was never run.
- **No model downgrade.** Phones only install a newer version. The checksum comes from the same server as the file, so it protects against broken downloads, not against an attacked server.
- **Retraining is manual.** The review queue gives labels and IDs as CSV. There is no script that turns them into a training folder, and no automatic retrain.
- **Single server.** The ML service keeps its registry in a file on one volume, and live updates use an in-memory event bus. Both work with one API and one ML instance only, and there is no backup.
- **No HTTPS in the Docker stack.** Put a reverse proxy with TLS in front of it for real use. The passwords in `.env.example` are placeholders.
- **Old MinIO image.** `bitnamilegacy/minio` is no longer maintained (ADR 0006).
- **Web tokens in `localStorage`.** The refresh token lives there (ADR 0015), which is weaker against XSS than an httpOnly cookie.
- **Gallery photos** get the time they were saved as `capturedAt`, not the time the photo was taken.
- **The seed scripts are not repeatable.** Running `seed.ts` twice adds another 20 inspections.
- **The web bundle is one large file** (about 800 kB). There is no code splitting yet.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `failed to connect to the docker API` | Docker Desktop is not running. Start it and wait for "Engine running". |
| `Set JWT_ACCESS_SECRET in .env` | Your `.env` is missing the JWT lines. Copy them from `.env.example`. |
| A port is already in use | Stop what uses it, or set `API_PORT`, `WEB_PORT`, `DB_PORT` and so on in `.env`. |
| Can not log in on the dashboard | You need the seed (`docker compose run --rm migrate npx tsx prisma/seed.ts`), and the user must be the admin. |
| App inspections stay "pending" | The app can not reach the API. Check `API_BASE_URL`. On a USB phone run `adb reverse tcp:3000 tcp:3000` again. Then sign out and in. |
| `P1001: Can't reach database server` | The database is not running. Run `docker compose up -d db`. |
| API tests fail on the first run | Make sure `fieldlens_test` exists and has the migrations (see "Run the tests"). |

## License

This project is for capstone learning and internal review.