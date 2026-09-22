# ADR 0003: Use tsx instead of ts-node-dev for local dev

**Date:** 2026-09-22
**Status:** Pending

## Context

To run the API locally without manually compiling TypeScript every time, I
installed `ts-node-dev` (the usual choice — it auto-restarts the server when
a file changes). But when I ran `npm run dev`, it crashed immediately with:

```
TypeError: Cannot read properties of undefined (reading 'fileExists')
```

Turned out the `typescript` package that got installed was version 7.0.2 —
a very new release — and `ts-node-dev` (through `ts-node`, which it depends
on) isn't compatible with it yet.

## Options considered

1. **Keep ts-node-dev, downgrade TypeScript** to an older version (like 5.x)
   just so it works. Works, but feels backwards — pinning an old compiler
   just to keep one dev tool happy, and I'd probably hit the same wall again
   whenever I do need to upgrade later.
2. **Switch to `tsx`** — a newer tool that does the same job (run + watch
   TypeScript files) but doesn't have this compatibility problem, and is
   generally faster too since it uses esbuild instead of the full TS
   compiler on every restart.

## Decision

Went with `tsx`. Uninstalled `ts-node-dev`, installed `tsx`, and changed the
`dev` script to:

```
tsx watch src/index.ts
```

## Rationale

No point fighting an old tool's compatibility bug when a newer, actively
maintained alternative does the exact same job without the issue — and runs
faster on top of that. This only affects local development; the actual
build (`tsc`) and production run (`node dist/index.js`) scripts didn't
change.

## Consequences

- `package.json` dev dependency is now `tsx`, not `ts-node-dev`.
- Anyone else setting this up locally won't hit the same crash.
- If TypeScript itself ever causes a similar issue with `tsx`, this decision
  gets revisited then.
