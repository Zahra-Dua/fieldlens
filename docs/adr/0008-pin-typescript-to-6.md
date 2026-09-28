# ADR 0008: Pin TypeScript to 6.0.x instead of using 7.x

**Date:** 2026-09-28
**Status:** accepted

## Context

On Day 2 I installed TypeScript without a version number, so npm picked
7.0.2, the newest release. It worked fine for building the API, and when
`ts-node-dev` broke on it (ADR 0003) I switched the dev runner to `tsx`
instead of downgrading TypeScript.

On Day 5 I added ESLint with `typescript-eslint` (needed for the
`npm run lint` requirement). The install failed:

```
peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.70.1
Found: typescript@7.0.2
```

`typescript-eslint` doesn't support TypeScript 7 yet.

## Options considered

1. **Install with `--force` / `--legacy-peer-deps`** — it would install,
   but typescript-eslint reads TypeScript's internal API to parse code,
   and that API is exactly what changes between major versions. I'd
   probably get runtime failures inside the linter that are much harder
   to debug than a clear install error.
2. **Skip type-aware linting / use a different linter** — the program
   document asks for ESLint specifically, and there's no other standard
   TypeScript linter to swap in the way `tsx` swapped in for `ts-node-dev`.
3. **Pin TypeScript to 6.0.x** — supported by typescript-eslint, and it's
   the same major version the NestJS spike was already using without
   problems.

## Decision

Pinned TypeScript with a tilde range, `typescript@~6.0.2`, so npm stays on
6.0.x and can't drift to 6.1+, which is outside typescript-eslint's
supported range too.

## Rationale

The difference from ADR 0003: there, a separate tool was the problem and
a replacement existed. Here TypeScript itself is what the linter depends
on, and downgrading one dev dependency is cheaper than forcing an
unsupported combination. Nothing in the project uses TypeScript 7-only
features — `npm run build` and all 14 tests passed on 6.0 unchanged.

## Consequences

- `package.json` has `"typescript": "~6.0.2"`.
- `tsx` stays (ADR 0003 still holds — it's simply faster than
  `ts-node-dev`, and unaffected by this).
- When typescript-eslint adds TypeScript 7 support, upgrading is a
  one-line change; `npm run build`, `npm test`, and `npm run lint` are
  the checks to run afterwards.
