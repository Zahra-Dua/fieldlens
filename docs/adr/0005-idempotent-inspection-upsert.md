# ADR 0005: Client-generated UUIDs with idempotent upsert for inspections

**Date:** 2026-09-25
**Status:** accepted

## Context

The Flutter app captures inspections offline and queues them locally.
When the network comes back, it syncs a batch to the server. Networks are
unreliable — the app might send a batch, the server might save it
successfully, but the response could get lost on the way back (dropped
connection, app killed mid-request, etc). The app has no way to know the
save actually worked, so its only safe option is to retry.

If retrying could create duplicates, every flaky connection would slowly
fill the database with the same inspection multiple times. This is
exactly the problem the program document calls out as "the single most
important API decision of the month."

## Options considered

1. **Server generates the ID, client has no say** — the usual REST
   default. Doesn't work here: the app creates the inspection record
   *before* it ever has network access, so there's no server round-trip
   to get an ID from at creation time.
2. **Client generates the ID, server always creates (ignores duplicates
   silently or errors on conflict)** — closer, but "error on conflict"
   would make every legitimate retry look like a client bug, and
   "silently ignore" means the client can't tell if its first attempt
   actually landed.
3. **Client generates the ID (UUID), server does an upsert keyed on that
   ID** — first arrival creates the record; every later arrival with the
   same ID just updates status/sync fields instead of creating a new row.

## Decision

The client (Flutter app) generates a UUID for each inspection at capture
time, before it's ever synced. `POST /inspections` performs a
`prisma.inspection.upsert()` per item, keyed on that UUID:

- **First time this ID arrives** → create the inspection, its prediction,
  and any images.
- **Same ID arrives again** (retry) → just refresh `status`/`syncedAt`,
  don't recreate the prediction or images.

The whole batch is wrapped in `prisma.$transaction([...])` — either the
entire batch commits, or none of it does, so a partially-failed batch
retry can't leave the database in a half-synced, confusing state.

## Rationale

This is the only option of the three that actually matches how the app
works: IDs have to exist before the network does. Making the upsert
idempotent on that ID means retries are always safe — sending the same
batch once or five times has the same end result, which is exactly the
behavior the offline-sync engine (Days 8–10) will depend on.

## Consequences

- `Inspection.id` in Prisma is a plain `String` (UUID), not an
  auto-increment integer — already reflected in the schema since Day 1.
- The create endpoint's Zod schema requires `id` in the request body
  (`inspectionInputSchema`) — it's never server-generated.
- A retried inspection's prediction/image data is intentionally *not*
  overwritten — only sync-status fields update. If a future requirement
  needs "update inspection details after the fact," that would need a
  separate, explicit update endpoint rather than relying on this upsert.
- This same pattern (client ID + upsert) is the template for anything
  else the offline app creates and syncs later.
