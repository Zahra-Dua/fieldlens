# FieldLens

FieldLens is an offline-first inspection platform for waste sorting. Field
workers capture images on-device, classify them locally, and sync results back to
a shared API when connectivity is available.

## Project goals

- offline-first mobile capture
- deterministic sync with retry-safe idempotency
- Fastify API with PostgreSQL persistence
- MinIO-backed image storage
- admin-facing inspection dashboard and model lifecycle workflow

## Tech stack

- API: Node.js + TypeScript + Fastify
- Database: PostgreSQL + Prisma
- Storage: MinIO
- Auth: JWT + refresh-token rotation
- Tests: Vitest + Supertest
- Docs: OpenAPI / Swagger UI

## Repository layout

```text
fieldlens/
├── apps/
│   ├── api/
│   ├── app/
│   ├── ml/
│   └── web/
├── docs/
│   └── adr/
├── docker-compose.yml
├── .env.example
├── README.md
└── spikes/
```

## Local setup

From a clean clone:

```bash
git clone <repo-url>
cd fieldlens
cp .env.example .env

docker compose up -d db minio

cd apps/api
npm install
npx prisma migrate deploy
npm run test
npm run build
npm run dev
```

Then open:

- API: http://localhost:3000/health
- Swagger UI: http://localhost:3000/docs

## Environment variables

The committed template is in [.env.example](.env.example). Copy it to `.env` and
fill in local values before running Prisma or the app.

Required values include:

```env
POSTGRES_USER=fieldlens
POSTGRES_PASSWORD=change_me_locally
POSTGRES_DB=fieldlens
DATABASE_URL=postgresql://fieldlens:change_me_locally@localhost:5432/fieldlens
MINIO_ROOT_USER=fieldlens_minio
MINIO_ROOT_PASSWORD=change_me_locally_minio
```

## API documentation

The live Swagger docs are served at:

```text
http://localhost:3000/docs
```

The JSON schema is available at:

```text
http://localhost:3000/docs/json
```

> The contract is considered failed if the docs describe an endpoint that the running API does not actually implement.

## Core API routes

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /devices/register`
- `POST /inspections`
- `GET /inspections`
- `GET /inspections/:id`
- `DELETE /inspections/:id`
- `POST /inspections/:id/images`
- `GET /health`

## Testing

Run from the API folder:

```bash
npm run test
npm run build
npm run lint
```

## Documentation and ADRs

- Architecture Decision Records: [docs/adr](docs/adr)
- Design notes and project rationale are tracked there.

## License

This project is for capstone learning and internal review.
