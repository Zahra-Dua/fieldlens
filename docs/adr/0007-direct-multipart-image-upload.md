# ADR 0007: Direct multipart upload instead of presigned URLs

**Date:** 2026-09-26
**Status:** accepted

## Context

Day 4 requires adding image upload for inspections, and the program
document explicitly calls out two approaches: "presigned URL or direct
multipart" — and asks for an ADR explaining whichever gets picked.

## Options considered

1. **Presigned URLs** — the API generates a short-lived, signed URL that
   points directly at MinIO/S3. The client uploads the file straight to
   that URL, bypassing the API server entirely for the actual bytes.
   - Pros: the API server never touches the file bytes, so it doesn't tie
     up a request thread/connection for the duration of a large upload;
     scales well if uploads are frequent or large.
   - Cons: two round trips instead of one (ask for a URL, then upload to
     it); the client needs extra logic to request a URL, then PUT to it,
     then tell the API the upload is done; harder to validate the file
     (type/size) before it's already sitting in storage.

2. **Direct multipart upload through the API** — the client sends the
   image straight to the API (`POST /inspections/:id/images` as
   multipart/form-data), and the API itself streams it into MinIO after
   validating it.
   - Pros: one request, one round trip; the API can validate mimetype and
     size *before* anything lands in storage; simpler client code (one
     upload call, not a three-step dance); easier to reason about and
     debug for a solo 4-week build.
   - Cons: the API server does sit in the request path for the upload
     duration — a real concern at scale, less so for a capstone with a
     handful of field workers.

## Decision

Direct multipart upload, using `@fastify/multipart` on the server and the
`minio` SDK to stream the validated buffer into the bucket.

## Rationale

Presigned URLs are the better choice for a production system with heavy
upload traffic — but this project's actual load (a handful of field
workers occasionally uploading a photo each) doesn't need that. Direct
upload keeps the client (eventually the Flutter app) simpler: capture a
photo, POST it, done — no separate "ask for a URL" step to implement and
debug on the mobile side, which matters given the rest of the offline-sync
work already competing for time in this program.

Validation is also cleaner this way: the API checks mimetype (JPG/PNG/WebP
only) and enforces a 10MB size limit (via `@fastify/multipart`'s built-in
`limits.fileSize`) before anything is written to MinIO, rather than having
to validate after the fact or trust the client.

## Consequences

- `POST /inspections/:id/images` accepts `multipart/form-data`, not JSON.
- The API server is in the data path for every upload — acceptable at
  this project's scale, but would need revisiting (likely moving to
  presigned URLs) if FieldLens ever needed to handle high upload volume.
- Oversized uploads are caught via `@fastify/multipart`'s stream-level
  `truncated` flag rather than a pre-read size check — the file size
  isn't known until the stream is actually consumed.
