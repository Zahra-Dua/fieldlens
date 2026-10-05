# ADR 0013: Sync engine design

**Date:** 2026-10-05
**Status:** accepted

## Context
Day 10 pushes the local outbox (ADR 0011) to the API. Retries must be
safe, which the upsert keyed on the client UUID gives us (ADR 0005). The
photo goes through a separate multipart endpoint (ADR 0007). The API
requires a prediction on every inspection, but the on-device model only
arrives on Day 14. The Segment 1 API is not changed in this PR.

## Options considered
1. **Prediction fields.** (a) Send a placeholder from the client.
   (b) Make them optional in the API. (c) Hold back syncing until Day 14.
2. **Pull direction.** (a) Implement it now with `dateFrom`. (b) Add an
   `updatedSince` filter to the API. (c) Defer it.
3. **Photo step.** (a) Remember in the outbox that the photo was
   uploaded. (b) Upload on every attempt. (c) Make the image endpoint
   idempotent on the server.
4. **Backoff state.** (a) In memory. (b) In the database.

## Decision
- Placeholder prediction (`PLASTIC`, `0.0`, `ON_DEVICE`), built in one
  place only (`ApiSyncRemote`) so Day 14 replaces it in one edit.
- Pull is deferred (see Consequences).
- The outbox row carries `imageUploaded`, so a retry skips a photo that
  already reached the server.
- Backoff lives in the database as `nextAttemptAt`.
- Errors are classified in one place:
  - Temporary (no connection, timeout, 5xx, 408, 429): back off and retry.
  - Permanent (other 4xx): mark `failed`, wait for a manual retry.
  - Session (401 after refresh): stop the run and keep the data.
- Backoff starts at 2 seconds, doubles up to a 5 minute ceiling, and each
  delay is randomised between half and the full value so devices that
  failed together do not retry together.
- A permanent rejection of a batch makes the worker resend its records
  one by one, so a single bad record cannot block the others.
- This device registers with a random UUID created once, because
  Android's build id is shared by every phone on the same firmware. The
  server's device id is cached in a small `sync_meta` table.
- Sync runs at app start, on resume, on reconnect, after a photo is
  saved, from a "Sync now" button, from a retry timer, and from a
  30-second check. `connectivity_plus` only reports that a network
  interface is up, not that the API is reachable, so one event is not
  trusted.
- "Sync now" clears the backoff. Automatic triggers respect it.

## Answers to the spec's design questions
- **App killed mid-sync.** Rows left in `syncing` are put back to
  `pending` at the start of every run. This is safe because the metadata
  upsert is idempotent. Recoverable states: `pending`, `syncing` (reset
  on start), and `failed` (waits for the user). A synced row is never
  touched.
- **Two syncs at once.** Every trigger calls one shared run. A second
  call while one is active gets the same future, so rows are never sent
  twice at the same moment. This is per process, which is enough while
  only one isolate syncs.

## Rationale
The placeholder keeps the whole pipeline testable before the model
exists, and changing the Segment 1 API was out of scope. Storing backoff
in the database means a restart does not forget that the server was
struggling. The 30-second check is cheap and makes the engine
self-healing when a connectivity event is missed.

## Consequences
- Server rows currently hold a placeholder prediction. The dashboard
  (Days 17-18) must not treat them as real results until Day 14 fills in
  real values.
- The image endpoint creates a new image row on every call. If the app
  dies after a photo upload but before `imageUploaded` is saved, that
  photo is uploaded again. The window is tiny. The proper fix is one
  image per inspection on the server, deferred because the API is
  unchanged.
- Pull is not built. The API has no updated-since filter (`.strict()`
  rejects unknown query params), and a local inspection requires a photo
  path, which a server-only row does not have. Nothing on the server
  changes an inspection yet. Revisit when corrections arrive (Days
  14-18).
- Schema is now v3: `imageUploaded`, `nextAttemptAt`, `lastError`, and
  the `sync_meta_entries` table.