# Running FieldLens with Docker

## One command

```
git clone https://github.com/Zahra-Dua/fieldlens.git
cd fieldlens
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up --build
```

When every service shows `healthy`, open:

| What | Address |
| --- | --- |
| Admin dashboard | http://localhost:5173 |
| API docs (Swagger) | http://localhost:3000/docs |
| ML service docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 |

To create the demo users and data (run once):

```
docker compose run --rm migrate npx tsx prisma/seed.ts
```

Login: `admin@fieldlens.dev` / `Password123!`

Stop everything: `docker compose down`. Also delete the data: `docker compose down -v`.

## What runs

| Service | Image | Port | Healthcheck |
| --- | --- | --- | --- |
| db | postgres:16 | 5432 | `pg_isready` |
| minio | bitnamilegacy/minio | 9000, 9001 | TCP check on 9000 |
| ml | built from `apps/ml` | 8000 | `GET /health` |
| migrate | built from `apps/api` (build stage) | none | runs once, then exits |
| api | built from `apps/api` | 3000 | `GET /health` |
| web | built from `apps/web` (nginx) | 5173 (inside: 8080) | `GET /` |

Start order is controlled by `depends_on` with health conditions:
`db` + `minio` + `ml` healthy, then `migrate` finishes, then `api`, then `web`.

## How the images are built

- **Multi-stage.** One stage installs and builds. The final stage copies only what is needed to run.
- **Layer caching.** The dependency files are copied first, then `npm ci` / `uv sync` runs, then the source code is copied. A code change does not reinstall dependencies.
- **Non-root.** api runs as `node`, ml as `appuser`, web as nginx-unprivileged.
- **No secrets in images.** `.dockerignore` keeps `.env` out. Secrets are given to the containers at run time by `docker-compose.yml`, never at build time.
  The only build-time value is `VITE_API_URL` (web), which is public by design.

## Image sizes: before and after

"Before" = a single-stage Dockerfile on the full base image (`docs/docker/naive/`).
"After" = the real multi-stage Dockerfile in each app folder.
Measured with `scripts/compare-image-sizes.ps1`.

| App | Before (MB) | After (MB) | Saved |
| --- | --- | --- | --- |
| api | 658.2 | 173.8 | 74% |
| ml  | 494.5 | 110.2 | 78% |
| web | 493.2 | 24.6  | 95% |

Why each one shrank:

- **api:** the final image has no TypeScript compiler, no test tools, no source, and uses the `slim` base.
- **ml:** the final image has no pip or uv, no build cache, and uses the `slim` base.
- **web:** the final image is only nginx plus static files. Node and `node_modules` are gone.

## Checking that no secrets are inside

```
powershell -ExecutionPolicy Bypass -File scripts/check-image-secrets.ps1
```

It reads the secret values from your local `.env` and checks, for each image, that they are not in the layer history, the image config, or any file. It also checks that the image has no `.env` file and does not run as root.

Result: PASSED (4 secret values checked in 3 images)

## CI

`.github/workflows/ci.yml` runs on every pull request. Path filters decide which jobs run:

| Changed folder | Jobs that run |
| --- | --- |
| `apps/api` | lint, test (with Postgres and MinIO), build, Docker image |
| `apps/ml` | compile check, pytest, Docker image |
| `apps/web` | format check, lint, test, build, Docker image |
| `apps/app` | `flutter analyze`, `flutter test`, debug APK |
| `docker-compose.yml`, `.env.example` | `docker compose config` check |

The last job, `ci-ok`, fails if any job failed. In GitHub: Settings, Branches, add a rule for `main`, and require only `ci-ok`.
