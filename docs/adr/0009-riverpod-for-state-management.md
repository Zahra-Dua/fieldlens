# ADR 0009: Riverpod for Flutter state management

**Date:** 2026-09-28
**Status:** accepted

## Context

The Flutter app has to do more than show screens. It keeps a local database, runs a sync engine in the background, refreshes auth tokens, and later runs ML inference. A lot of that work happens outside any widget, so I need state management that does not depend on `BuildContext`.

Screens I already know I need: login, capture, history. The history list will be fed by the local database (Drift, Day 8) and should update on its own when a row changes sync status.

The spec asks for Riverpod or Bloc and wants an ADR either way.

## Options considered

1. **Provider (the package)**
   - Pros: simple, very well known, tiny API.
   - Cons: providers live in the widget tree, so reading one needs a `BuildContext`. If you ask for a provider that is not above you in the tree, you find out at runtime, not at compile time. Awkward for my sync engine, which has no widget.

2. **Bloc / Cubit**
   - Pros: strict flow (event in, state out) so every change is traceable. Good testing story. Scales well with big teams that want a fixed pattern.
   - Cons: more boilerplate for small pieces of state (an event class, a state class, a bloc for a single boolean like "is signed in"). Still tied to the widget tree for injection (`BlocProvider`).

3. **Riverpod**
   - Pros: providers are declared globally and read through a `ref`, so non-widget code (repositories, the sync worker) can use them too. Missing or wrongly typed dependencies are caught by the compiler. Tests can swap any provider with `overrides`. Has built-in shapes for async data and streams.
   - Cons: a different mental model from plain Flutter, and the API has changed between major versions, so old tutorials are misleading.

## What the provider types are for

- **`Provider`**: a read-only value that never changes on its own, or is computed from other providers. Example for FieldLens: the API base URL from config, the router, a repository instance.
- **`FutureProvider`**: one async result that is loaded once (with loading, data, error states). Example: fetch the latest model version on launch.
- **`StreamProvider`**: a value that keeps changing over time. Example: the history screen watching the local inspections table via a Drift stream, so a row flipping from `pending` to `synced` shows up without a manual refresh.
- **`Notifier` / `AsyncNotifier`**: state that the UI or code changes through methods. Example: auth state with `signIn()` and `signOut()`, or the sync controller with `syncNow()`.
- **`StateNotifierProvider`**: the older way of doing what `Notifier` does. In the Riverpod version I installed (3.x) it is treated as legacy, so I am using `Notifier` instead of what the spec text mentions. I checked this against the Riverpod docs, not just relied on memory.

## Decision

We will use **Riverpod** (`flutter_riverpod`), with `Notifier` / `AsyncNotifier` for state that changes and `StreamProvider` for data coming from the local database. Providers will double as dependency injection, in `core/providers/`.

## Rationale

The deciding factor is the sync engine. It runs on connectivity changes and timers, and needs the database, the API client and the auth state without any widget around it. With Riverpod it reads those through a `ref`. With Provider or Bloc I would have to pass things around by hand or bolt on a separate service locator.

Bloc would have worked too, and its strict event log is nice. For a solo project with a 20 day timeline it is more ceremony than I need, especially for small pieces of state like the auth flag.

## Consequences

- Easier: testing (override the API client or database provider with a fake), reacting to a database stream in the UI, sharing state between screens.
- Easier: one less package, since Riverpod also acts as the DI layer.
- Harder: I have to learn Riverpod's lifecycle rules (when providers are created and disposed, `ref.watch` vs `ref.read`). I also have to be careful with tutorials written for older versions.
- Committed to: the `Notifier` style API of Riverpod 3.x. Upgrading major versions later may need code changes.

**Would make us revisit this:** the app growing into a multi-developer codebase where a strict, auditable event flow matters more than low boilerplate, or Riverpod's API changing in a way that makes upgrades expensive.
