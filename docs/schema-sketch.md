# FieldLens — Database schema sketch (Day 1)

This is the paper-sketch version of the schema, done before touching Prisma
(Day 2). Entities and relationships only — exact column types and
constraints will be finalised when the Prisma schema is written.

```mermaid
erDiagram
    USER ||--o{ REFRESH_TOKEN : "has many"
    USER ||--o{ DEVICE : "owns"
    USER ||--o{ INSPECTION : "creates"
    DEVICE ||--o{ INSPECTION : "records"
    INSPECTION ||--o{ INSPECTION_IMAGE : "has"
    INSPECTION ||--o{ PREDICTION : "has"
    MODEL_VERSION ||--o{ PREDICTION : "produces"

    USER {
        uuid id PK
        string name
        string email UK
        string passwordHash
        enum role
        boolean isActive
        datetime createdAt
    }

    REFRESH_TOKEN {
        uuid id PK
        uuid userId FK
        string tokenHash
        datetime expiresAt
        datetime revokedAt
    }

    DEVICE {
        uuid id PK
        uuid userId FK
        string deviceUuid UK
        enum platform
        string appVersion
        datetime lastSeenAt
    }

    INSPECTION {
        uuid id PK "client-generated"
        uuid userId FK
        uuid deviceId FK
        enum status
        decimal latitude
        decimal longitude
        datetime capturedAt
        datetime syncedAt
    }

    INSPECTION_IMAGE {
        uuid id PK
        uuid inspectionId FK
        string objectKey "MinIO/S3 path"
        string mimeType
        int fileSize
        string checksum
    }

    PREDICTION {
        uuid id PK
        uuid inspectionId FK
        uuid modelVersionId FK
        enum predictedClass "PLASTIC/GLASS/METAL/PAPER/ORGANIC"
        decimal confidence
        enum inferenceSource "ON_DEVICE/CLOUD"
        boolean isAccepted
        enum correctedClass
    }

    MODEL_VERSION {
        uuid id PK
        string version
        string fileKey "MinIO/S3 path"
        enum format "TFLITE/ONNX"
        string sha256
        enum status "DRAFT/ACTIVE/RETIRED"
        decimal accuracy
    }
```

## Notes on key decisions (expand into ADRs when implemented on Day 2)

- **Inspection.id is client-generated (UUID), not an auto-increment
  integer.** The Flutter app creates inspections offline and must generate
  its own ID before it ever talks to the server. This is what makes the
  sync upsert idempotent later (Day 4).
- **Images are never stored in Postgres.** `InspectionImage` only stores a
  reference (`objectKey`) to where the file lives in MinIO/S3.
- **One Inspection can have multiple Predictions** — e.g. an on-device
  prediction, a cloud fallback, and a re-prediction after a model update.
- **RefreshToken is stored server-side** (hashed) so tokens can be revoked,
  rather than relying purely on JWT expiry.
