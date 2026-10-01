# ADR 0012: Token storage and refresh strategy

**Date:** 2026-10-01
**Status:** accepted

## Context
The API issues a 15-minute access token and a revocable refresh token.
The app is offline-first, so a failed refresh must not be confused with
an expired session. Several requests can fail with 401 at the same time.

## Options considered
1. **Refresh on every 401, per request** — simple, but concurrent 401s
   each call /auth/refresh. With revocable refresh tokens, the second
   call can invalidate the first one's token.
2. **Refresh proactively before expiry (timer or JWT exp check)** —
   avoids most 401s, but depends on the device clock and still needs a
   fallback.
3. **Reactive refresh with a single in-flight Future** — one refresh
   call is shared by all waiting requests.

## Decision
Option 3. The first 401 starts the refresh, the others await the same
Future, then each retries once. A retry flag stops a second 401 from
refreshing again.

Tokens live in flutter_secure_storage (platform keystore), never
SharedPreferences.

Only a 400/401/403 from /auth/refresh ends the session: tokens are
cleared and the UI is told to show the login. Timeouts and connection
errors keep the tokens, because being offline is not being logged out.

## Rationale
One refresh call per expiry keeps us safe with refresh-token revocation.
Separating "server rejected" from "network failed" is what keeps the
app usable offline, which is the point of FieldLens.

## Consequences
Easier: no refresh storm, offline sessions survive.
Harder: requests with a one-shot body (Day 10 FormData uploads) cannot
be retried by re-fetching the same options, they must be rebuilt.
Revisit if the API moves to refresh-token rotation with a grace window,
or if clock-based proactive refresh becomes worthwhile.