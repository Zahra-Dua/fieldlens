// prisma/seed.ts
//
// Populates the database with sample data for local development:
// a few users (one ADMIN, a couple of FIELD_WORKERs), one device,
// a couple of model versions, and ~20 inspections with predictions.
//
// Run with: npm run seed
import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client";
import { WasteClass, DevicePlatform } from "../src/generated/prisma/enums";

const prisma = new PrismaClient();

// Small helpers — keeps the "generate ~20 of these" logic readable.
function randomFrom<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);
  // items is non-empty in every call site below, so this is always defined.
  return items[index] as T;
}

function randomDateWithinLastDays(days: number): Date {
  const now = Date.now();
  const past = now - Math.random() * days * 24 * 60 * 60 * 1000;
  return new Date(past);
}

const WASTE_CLASSES: WasteClass[] = [
  "PLASTIC",
  "GLASS",
  "METAL",
  "PAPER",
  "ORGANIC",
];

async function main() {
  console.log("🌱 Seeding FieldLens database...");

  // ── 1. Users ──────────────────────────────────────────────
  // Never store plain-text passwords — hash with argon2, same as Day 3 auth will.
  const passwordHash = await argon2.hash("Password123!");

  const admin = await prisma.user.upsert({
    where: { email: "admin@fieldlens.dev" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@fieldlens.dev",
      passwordHash,
      role: "ADMIN",
    },
  });

  const fieldWorker = await prisma.user.upsert({
    where: { email: "worker@fieldlens.dev" },
    update: {},
    create: {
      name: "Zahra (Field Worker)",
      email: "worker@fieldlens.dev",
      passwordHash,
      role: "FIELD_WORKER",
    },
  });

  console.log(`  ✔ Users: ${admin.email} (ADMIN), ${fieldWorker.email} (FIELD_WORKER)`);

  // ── 2. Device ─────────────────────────────────────────────
  const device = await prisma.device.upsert({
    where: { deviceUuid: "seed-device-0001" },
    update: {},
    create: {
      userId: fieldWorker.id,
      deviceUuid: "seed-device-0001",
      name: "Zahra's Test Phone",
      platform: DevicePlatform.ANDROID,
      appVersion: "0.1.0",
      osVersion: "Android 14",
      lastSeenAt: new Date(),
    },
  });

  console.log(`  ✔ Device: ${device.name}`);

  // ── 3. A model version (so predictions have something to point to) ──
  const modelVersion = await prisma.modelVersion.upsert({
    where: { name_version: { name: "waste-classifier", version: "0.1.0" } },
    update: {},
    create: {
      name: "waste-classifier",
      version: "0.1.0",
      format: "TFLITE",
      platform: "ANDROID",
      fileKey: "models/waste-classifier-0.1.0.tflite",
      sha256: "seed-placeholder-hash",
      sizeBytes: 4_500_000,
      status: "DRAFT",
      accuracy: 0.85,
    },
  });

  console.log(`  ✔ Model version: ${modelVersion.name} v${modelVersion.version}`);

  // ── 4. ~20 inspections, each with one prediction ─────────────
  const INSPECTION_COUNT = 20;

  for (let i = 0; i < INSPECTION_COUNT; i++) {
    const predictedClass = randomFrom(WASTE_CLASSES);
    const capturedAt = randomDateWithinLastDays(14);
    // Most inspections are already synced; a few are still pending, to make
    // the sync-status UI meaningful to look at later.
    const status = i % 5 === 0 ? "PENDING" : "SYNCED";

    const inspection = await prisma.inspection.create({
      data: {
        userId: fieldWorker.id,
        deviceId: device.id,
        status,
        latitude: 33.6844 + (Math.random() - 0.5) * 0.05,
        longitude: 73.0479 + (Math.random() - 0.5) * 0.05,
        capturedAt,
        syncedAt: status === "SYNCED" ? capturedAt : null,
        images: {
          create: {
            objectKey: `inspections/seed-${i}.jpg`,
            mimeType: "image/jpeg",
            fileSize: 250_000 + Math.floor(Math.random() * 200_000),
          },
        },
        predictions: {
          create: {
            modelVersionId: modelVersion.id,
            predictedClass,
            confidence: 0.7 + Math.random() * 0.29,
            inferenceSource: "ON_DEVICE",
            inferenceTimeMs: 60 + Math.floor(Math.random() * 40),
            isAccepted: true,
          },
        },
      },
    });

    console.log(`  ✔ Inspection ${i + 1}/${INSPECTION_COUNT} (${inspection.id.slice(0, 8)}...) — ${predictedClass}`);
  }

  console.log("🌱 Seeding complete!");
}

main()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
