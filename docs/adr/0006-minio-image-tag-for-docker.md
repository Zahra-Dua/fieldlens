# ADR 0006: Use bitnamilegacy/minio with a pinned tag, not minio/minio:latest

**Date:** 2026-09-25
**Status:** accepted

## Context

Adding MinIO to `docker-compose.yml` for image storage (as required by the
architecture), the obvious first choice was the official
`minio/minio:latest` image. That failed with "pull access denied."
Trying the official secondary registry, `quay.io/minio/minio:latest`,
failed too, with a 401. Trying `bitnami/minio:latest` failed with
"not found."

Looking into it, MinIO's own distribution has recently changed — official
pre-built binaries/images are being pulled behind more restricted access,
and Bitnami separately moved their free, publicly-pullable images to a
`bitnamilegacy` namespace with specific pinned version tags instead of a
`latest` tag.

## Options considered

1. **Keep chasing `minio/minio:latest` or official mirrors** — kept
   hitting different auth/access errors on every registry tried; not a
   quick fix and not something worth losing more time to for one Docker
   service.
2. **`bitnamilegacy/minio` with a specific, confirmed-existing pinned
   tag** (`2025.7.23-debian-12-r5`) — publicly pullable, no login
   required, and "legacy" here just means it's frozen rather than
   auto-updated — perfectly fine for a spec-compliant, S3-compatible
   object store in a 4-week project.
3. **Skip MinIO, use a different local S3-compatible tool** — more
   disruption than necessary; MinIO is explicitly named in the program
   document's architecture diagram, and the actual API (S3-compatible)
   is unaffected by which specific image tag runs it.

## Decision

Using `bitnamilegacy/minio:2025.7.23-debian-12-r5` in `docker-compose.yml`,
with `MINIO_BROWSER: "on"` explicitly set — this image defaults the web
console to *off*, unlike the original `minio/minio` image which enables
it by default.

## Rationale

This gets the exact same MinIO server functionality (S3-compatible API,
web console) without depending on registries that are currently
inconsistent for anonymous pulls. Pinning an exact tag (rather than any
`latest`) is also just better practice for reproducibility — anyone
cloning the repo gets the exact same MinIO version, not whatever happens
to be tagged `latest` on the day they run `docker compose up`.

## Consequences

- `docker-compose.yml` references a specific, dated MinIO version rather
  than "latest" — it won't auto-update, which is intentional.
- If this tag is ever removed from Docker Hub, the fix is the same
  process: find a currently-pullable pinned tag and update this one line.
- The application code talks to MinIO purely through its S3-compatible
  API — none of this affects how the API server integrates with it.
