# ADR 0001: Record architecture decisions

**Date:** 2026-09-21
**Status:** Pending

## Context

This project has a lot of decisions to make over the next 4 weeks — which
framework to use, how to structure the database IDs, how to handle image
storage, and so on. If I don't write these down, I'll forget why I picked
something by the time review comes around. The program also specifically
asks for this (any non-obvious decision should be recorded).

## Options considered

1. **Don't write anything down** — just remember it or explain it verbally
   at review. Easiest, but I'll forget details, and there's no record for
   my mentor to look at.
2. **Write comments in the code** — explain decisions where they happen.
   Okay for small things, but bigger decisions (like "why UUIDs instead of
   auto-increment IDs") don't really belong to one file.
3. **Keep separate ADR files** in `docs/adr/`, one per decision, using the
   template given in the program document (Appendix A).

## Decision

Going with option 3 — a numbered ADR file for every real decision, stored in
`docs/adr/`. I'll write one whenever the program explicitly asks for one, or
whenever I'm choosing between two genuinely different approaches and the
reasoning isn't obvious just from reading the code.

I won't write one for small stuff like naming a folder — just for actual
technical trade-offs.

## Rationale

It's quick to write, easy to read back later, and it's basically what the
program is grading under "Documentation, ADRs, and Git hygiene." Better to
have a short paper trail than try to remember everything at the Day 20
retrospective.

## Consequences

Every time I make a real technical decision from here on, there should be a
new ADR file next to this one. This file is basically the reason all the
others exist.
