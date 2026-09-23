# ADR 0004: Use jsonwebtoken directly instead of @fastify/jwt namespaces

**Date:** 2026-09-23
**Status:** accepted

## Context

For Day 3's auth, I needed two kinds of JWTs — a short-lived access token
and a long-lived refresh token — each signed with its own secret. The
natural choice was `@fastify/jwt`, using its "namespace" feature to
register two separate configs on the same plugin.

This crashed under TypeScript's strict mode. Declaring the extra
decorators (`app.jwt.access`, `request.accessJwtVerify`, etc.) kept
conflicting with the plugin's own built-in types, no matter how I tried to
augment them. Turns out this isn't just me — TypeScript support for
multiple namespaces in `@fastify/jwt` has an open, unresolved GitHub issue
(fastify/fastify-jwt#286).

## Options considered

1. **Keep fighting the @fastify/jwt namespace types** — kept producing new
   type errors every time I fixed the last one; clearly not a quick fix,
   and not something worth burning a day of a 4-week capstone on.
2. **Use `@fastify/jwt` twice, as two separately-registered plugin
   instances** (not namespaced) — possible, but Fastify plugin
   encapsulation makes sharing two instances across modules awkward for
   this kind of "sign anywhere in the service layer" use case.
3. **Skip Fastify's JWT plugin entirely, use the `jsonwebtoken` npm
   package directly** — plain functions, two secrets from `.env`, no
   Fastify decorators, no plugin registration needed at all.

## Decision

Went with option 3. Removed `@fastify/jwt`, added `jsonwebtoken` and
`@types/jsonwebtoken`. All signing/verification lives in
`src/shared/utils/jwt.ts` as four plain functions: `signAccessToken`,
`signRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`. The access
token payload includes the user's role, so the auth middleware can check
permissions without a database round-trip.

## Rationale

The auth service doesn't need a Fastify instance at all this way — it's
just calling plain functions, which also makes it easier to unit test
later (Day 5) without spinning up a Fastify app. Losing is minimal:
`@fastify/jwt` mainly saves a few lines of boilerplate, which
`jsonwebtoken` doesn't really cost back.

## Consequences

- `AuthService` methods (`login`, `refresh`, etc.) no longer take a
  `FastifyInstance` parameter — one less thing every call site has to pass
  around.
- The auth middleware (`requireAuth`) reads the `Authorization` header and
  calls `verifyAccessToken` directly, instead of relying on a Fastify
  request decorator.
- If a future Day needs more JWT plugin features (like automatic cookie
  handling), this decision should be revisited then.
