# FieldLens

FieldLens is an **offline-first, on-device ML inspection platform**.

A field worker points a phone at an object, the phone classifies it **on the
device with no network call**, the result is saved locally, and it syncs to a
server automatically once connectivity returns. A web dashboard aggregates
results and lets an admin push new model versions out to devices.

**Chosen classification domain: Waste Sorting**
Classes: `plastic` · `glass` · `metal` · `paper` · `organic`

This repository is the capstone project for the FieldLens CS Internship
Program (4 weeks / 20 working days).

---

## Why this project exists

- **On-device inference** — classification happens on the phone, not the cloud.
- **Offline-first sync** — the app is fully usable with the network off; data
  reconciles with the server once connectivity returns.
- **A polyglot backend** — a Node.js product API and a Python (FastAPI) ML
  service, talking to each other.
- **Two frontends, one API** — a Flutter mobile app and a React admin
  dashboard both consume the same backend.
- **Model lifecycle** — training, quantizing, versioning, and distributing a
  model to devices over the air.
- **Containerized delivery** — the whole system comes up with one command on
  a machine that isn't the developer's own.

---

## Architecture

```text
+-----------------------------+
|   fieldlens-web (React)     |
|   Vite / TS / TanStack      |
|   Admin dashboard           |
+--------------+--------------+
               | HTTPS + JSON
               v
+----------------------+        +-----------------------------+
|   fieldlens-app       | JSON  |   fieldlens-api (Node.js)    |
|   Flutter              |<---->|   Express/Fastify + Prisma   |
|                        |      |   JWT auth / REST            |
|  +----------------+    |      +------+---------------+------+
|  |  TFLite model   |    |            |               |
|  |  (on device)    |    |            v               v
|  +----------------+    |      +-------------+  +--------------+
|  +----------------+    |      |  Postgres   |  |  MinIO / S3  |
|  | SQLite outbox   |    |      |             |  |  (images)    |
|  +----------------+    |      +-------------+  +--------------+
+----------------------+              |
      ^                               | internal HTTP
      | model download (OTA)          v
      |                       +-----------------------------+
      +---------------------->|   fieldlens-ml (FastAPI)     |
                               |   model registry / convert   |
                               |   cloud-fallback inference   |
                               +-----------------------------+
```

## Repository layout

```text
fieldlens/
├── README.md
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── adr/              # Architecture Decision Records
│   ├── api.md
│   └── demo.md
├── spikes/                # Research spike example projects (graded)
│   ├── 01-node-frameworks/
│   ├── 02-ondevice-runtimes/
│   ├── 03-quantization/
│   └── 04-supabase-comparison/
├── apps/
│   ├── api/                # Node.js product API (Express/Fastify + Prisma)
│   ├── ml/                # FastAPI ML service (model registry + inference)
│   ├── app/               # Flutter mobile client
│   └── web/                # React admin dashboard
└── packages/
    └── shared-types/       # Shared TypeScript types (optional)
```

## Tech stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------- |
| Mobile     | Flutter, Riverpod, go_router, Drift, Dio                |
| ML (mobile)| TensorFlow Lite / LiteRT, MobileNetV3-Small              |
| API        | Node.js, TypeScript, Fastify/Express, Prisma, PostgreSQL |
| ML service | Python, FastAPI, Pydantic v2                              |
| Web        | React, TypeScript, Vite, TanStack Query                    |
| Storage    | MinIO / S3-compatible object storage                        |
| Infra      | Docker, Docker Compose, GitHub Actions                       |

## Getting started

> ⚠️ Setup instructions are placeholders as of Day 1 and will be completed by
> the end of Segment 1 (Day 5), once the API, database, and Docker Compose
> stack exist.

```bash
git clone <repo-url>
cd fieldlens
cp .env.example .env
docker compose up -d
```

## Documentation

- Architecture Decision Records: [`docs/adr/`](docs/adr)
- Research spikes: [`spikes/`](spikes)
- API reference: `docs/api.md` (added in Segment 1)
- Demo walkthrough: `docs/demo.md` (added in Segment 4)

## License

This is a personal capstone/learning project. Dataset licensing is documented
separately in [`docs/adr/0002-domain-and-dataset.md`](docs/adr/0002-domain-and-dataset.md).
