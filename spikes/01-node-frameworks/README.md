# Spike 1 — Node.js framework comparison

Three tiny implementations of the same API (health check, create item,
list items) — one each in Express, Fastify, and NestJS — used to compare
them for FieldLens. See `REPORT.md` in this folder for the full write-up
and recommendation.

## Running each one

Each framework lives in its own folder with its own `package.json`.

### Express (port 3001)
```bash
cd express
npm install
npm run dev
```

### Fastify (port 3002)
```bash
cd fastify
npm install
npm run dev
```

### NestJS (port 3003)
```bash
cd nestjs
npm install
npm run start:dev
```

## Endpoints (identical across all three)

- `GET /health` → `{ "status": "ok" }`
- `POST /items` → body `{ "name": string, "quantity": positive integer }`,
  returns the created item with a generated UUID (or a 400 validation
  error)
- `GET /items` → array of everything created so far (in-memory only —
  resets when the server restarts)

## Benchmarking

With a server running, from this folder (or anywhere — the URL includes
the port):

```bash
autocannon -c 10 -d 10 -m POST -H "Content-Type: application/json" -i body.json http://127.0.0.1:<port>/items
```

where `body.json` contains: `{"name":"Plastic Bottle","quantity":5}`
