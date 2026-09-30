# ADR 0011: Local persistence with Drift, and outbox as a separate table

**Date:** 2026-09-30
**Status:** accepted

## Context

Day 8 needs a local database that survives an app restart, stores each inspection's sync status, and gives the history screen live updates as that status changes. Two things needed a real decision: which local database library to use, and whether the sync queue lives in its own table or is just a column on `inspections`.

The spec also asks two questions in writing: what happens if the app is killed mid-sync, and how to stop two sync attempts running at the same time. Both matter for how the schema and DAO are shaped, even though the actual sync worker isn't built until Day 10.

## Options considered

**Database**
1. **sqflite.** Lower-level, closer to raw SQL. Familiar to a lot of Flutter tutorials, but every query is a hand-written string, so a typo in a column name is a runtime error, not a compile error.
2. **Drift.** Generates typed Dart code from table definitions, so queries are checked at compile time and `watch()` gives a `Stream` for free, which is exactly what the history screen needs. Costs a codegen step (`build_runner`) and a bit more setup.

**Outbox shape**
1. **No separate table — `inspections.syncStatus` is the whole queue.** Simpler schema, one less table, one less join.
2. **A separate `outbox_entries` table**, one row per inspection waiting to sync, holding `attemptCount` and `lastAttemptAt`.

## Decision

Using **Drift**, and keeping the **outbox as its own table** (`OutboxEntries`), separate from `Inspections`.

## Rationale

Drift won because the history screen needs to react live to sync status changes without me writing my own polling or notification code — `watchAll()` returns a `Stream<List<Inspection>>` and Riverpod's `StreamProvider` does the rest. Compile-time query checking also matters more here than in a quick script, since this table shape will change again on Day 10 when the sync worker starts writing to it.

The separate outbox table won because Day 10 explicitly asks for "a sync worker that drains the outbox in batches" with retry backoff. Retry count and last-attempt time are properties of *the sync attempt*, not of *the inspection itself* — an inspection doesn't have a "attempt count," a sync job does. Keeping them on a separate row means the sync worker's logic stays self-contained: it reads from `outbox_entries`, and once a sync succeeds it just deletes that row (or the inspection's status flips to `synced` and I can decide later whether to keep synced entries for a history log). If retry metadata lived directly on `inspections`, every query about "what does this inspection look like" would be cluttered with sync-machinery fields that have nothing to do with the inspection's actual content.

## Design questions (spec-required)

**What happens if the app is killed mid-sync? Which states are recoverable?**

An inspection's `syncStatus` is persisted to disk, not held in memory, so if the app is killed while a row is `syncing`, that row stays `syncing` in the database after restart — even though the actual upload never finished. Left alone, this row would never be retried, because the (future) sync worker would see `syncing` and assume it's already in progress somewhere. So on app start, before the sync worker does anything else, it needs to sweep the table for rows still marked `syncing` and reset them to `pending`. `pending` and `failed` rows are already safe as-is; `synced` is only ever set after a confirmed server response, so a kill can't leave a row incorrectly marked `synced`.

**How do you avoid two sync attempts running concurrently?**

A single in-memory boolean flag (something like `_syncInProgress`) on the sync worker. Every trigger that could start a sync — the connectivity listener coming back online, a manual "Sync now" button, a timer — checks this flag first. If it's already `true`, the new trigger is ignored instead of starting a second pass. This matters because connectivity returning and a manual tap can both fire within the same moment, and running the outbox drain twice at once risks double-uploading or racing on the same rows.

## Consequences

- Easier: the history screen updates itself with zero manual refresh code. The sync worker (Day 10) has a clean, dedicated table to read from and doesn't need to touch inspection content at all.
- Harder: writing an inspection and queuing it for sync are now two inserts instead of one, so they have to happen inside a single transaction — otherwise a crash between the two writes could leave an inspection with no outbox entry, meaning it would silently never sync. `InspectionDao.createInspection` wraps both inserts in `db.transaction()` for exactly this reason.
- Committed to: Drift's codegen step as part of the build. The generated `app_database.g.dart` file is committed to the repo rather than regenerated in CI, so a clean clone doesn't need `build_runner` just to compile.

**Would make us revisit this:** if Day 10's real sync worker turns out to need more queue states than pending/syncing/failed (e.g. a distinct "needs conflict resolution" state), or if keeping synced-but-not-yet-deleted outbox rows around for a sync history log turns out to be worth the extra complexity.
