# Spike 1: Node.js framework comparison

## The question

Express, Fastify, or NestJS for FieldLens's product API — and on what
grounds? The program deliberately takes the backend away from me (no
Firebase/Supabase), so this is the first real framework decision of the
whole project, and I wanted actual numbers instead of just going with
whatever's most familiar.

## What I built

The same three-endpoint API in all three frameworks — `GET /health`,
`POST /items` (validated), `GET /items` — with identical validation rules
(name: non-empty string, quantity: positive integer) and an in-memory
array standing in for a database. Each lives in its own folder under
`spikes/01-node-frameworks/`.

Express and Fastify use Zod for validation, since that's what the rest of
FieldLens already uses (Day 3's auth routes). For NestJS I used its own
native approach instead — `class-validator` decorators plus the built-in
`ValidationPipe` — on purpose, because forcing Zod into NestJS wouldn't
have shown me what NestJS actually feels like to use day-to-day.

I benchmarked all three with `autocannon` (10 connections, 10 seconds,
POST requests) against the `/items` endpoint.

## Results

| Metric | Express | Fastify | NestJS |
|---|---|---|---|
| Avg req/sec | 13,230 | **16,742** | 7,668 |
| Avg latency | 0.12 ms | **0.07 ms** | 0.77 ms |
| Max latency | 42 ms | **33 ms** | 142 ms |
| Total requests (10s) | 132k | **184k** | 77k |
| Lines of code | 56 (1 file) | **50** (1 file) | 85 (6 files) |
| Runtime dependencies | 2 | **2** | 7–8 |
| Setup | Manual | Manual | CLI-generated |

Fastify was the fastest by a clear margin — about 27% higher throughput
than Express and more than double NestJS's. That tracks with what Fastify
is built for; it's designed around minimizing per-request overhead.
NestJS was slowest, which makes sense once I saw what's actually running
under the hood: a dependency-injection container, decorator/metadata
processing via `reflect-metadata`, and a module resolution step, all
before my code even runs.

Lines of code don't tell the full story, though. NestJS's 85 lines are
spread across 6 files with real separation of concerns (controller,
service, DTO) — closer to the `routes → controller → service → repository`
pattern this project is already using in `apps/api`. Express and Fastify's
50-56 lines are just one file each, because the spike doesn't need more
structure than that — a real app would end up organizing them similarly to
NestJS eventually, just by hand instead of by convention.

One more thing worth noting: NestJS's validation errors were
automatically human-readable (`"name should not be empty"`) with zero
extra work, while the Zod-based ones needed the manual mapping I already
wrote for `apps/api`'s error handler.

## Recommendation for FieldLens

**Fastify.** Three reasons, specific to this project rather than a
general "best framework" take:

1. **Performance actually matters here.** FieldLens's offline-first sync
   means multiple field workers' devices can all reconnect and sync in a
   burst at once — exactly the kind of bursty, high-throughput load
   Fastify handles best of the three.
2. **Smallest dependency footprint.** 2 runtime dependencies vs NestJS's
   7-8. For a 4-week capstone I'm building and debugging solo, fewer
   moving parts means fewer places for things to break — which matters
   more than it sounds; a real example is documented in ADR 0004,
   where fighting `@fastify/jwt`'s own TypeScript typing cost real time.
3. **Already the foundation.** Day 3's auth module is already built on
   Fastify. Switching now would mean redoing working code for a framework
   whose main advantage — NestJS's enforced structure — I can get most of
   by just following the `services/repositories` pattern the program
   already asks for (§9.2), without the DI container overhead.

NestJS isn't a bad choice — for a larger team, or a longer-lived project
where enforced structure prevents drift across many contributors, its
opinionated architecture is a real advantage. It's just more than this
project's scope and timeline need.

## What I'd investigate next

I'd want to benchmark under closer-to-real conditions: with an actual
Postgres write per request (not an in-memory array), and with concurrent
connections closer to what FieldLens might see in the field (a handful of
devices, not 10 simultaneous connections hammering the server). I'd also
like to see whether NestJS's gap narrows once real I/O dominates the
request time — the DI overhead is probably a much smaller fraction of a
50ms database-bound request than it is of a near-instant in-memory one.
