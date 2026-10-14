// prisma/seed-demo.ts
//
// Bigger sample data for the web dashboard: 120 inspections over the last
// 30 days on 3 demo devices, with a mix of labels and confidences, some
// corrected labels, and a placeholder picture for each one.
//
// It only touches devices whose deviceUuid starts with "demo-device-", so it
// is safe to run again: it removes its own old data first.
//
// Run `npm run seed` once first (it creates the worker user), then:
//   npm run seed:demo
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { uploadToMinio } from "../src/shared/storage/minio";

const prisma = new PrismaClient();

const INSPECTION_COUNT = 120;
const LABELS = ["PLASTIC", "GLASS", "METAL", "PAPER", "ORGANIC"] as const;
type Label = (typeof LABELS)[number];

const LABEL_COLORS: Record<Label, string> = {
  PLASTIC: "#2563eb",
  GLASS: "#0d9488",
  METAL: "#64748b",
  PAPER: "#b45309",
  ORGANIC: "#15803d",
};

const DEVICES = [
  { deviceUuid: "demo-device-0001", name: "Demo phone A", platform: "ANDROID" },
  { deviceUuid: "demo-device-0002", name: "Demo phone B", platform: "ANDROID" },
  { deviceUuid: "demo-device-0003", name: "Demo iPhone", platform: "IOS" },
] as const;

function randomFrom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

// Mostly high confidence, with a tail of low ones, like a real model.
function randomConfidence(): number {
  const value = 1 - Math.random() ** 2 * 0.7;
  return Math.min(0.99, Math.round(value * 1000) / 1000);
}

function placeholderSvg(label: Label): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">` +
    `<rect width="640" height="480" fill="${LABEL_COLORS[label]}"/>` +
    `<text x="320" y="250" font-family="sans-serif" font-size="56" fill="#ffffff" ` +
    `text-anchor="middle">${label}</text></svg>`
  );
}

async function main() {
  console.log("Seeding demo data for the dashboard...");

  const worker = await prisma.user.findUnique({
    where: { email: "worker@fieldlens.dev" },
  });
  if (!worker) {
    throw new Error("worker@fieldlens.dev not found. Run `npm run seed` first.");
  }

  // Remove the data from an earlier run of this script (and only that data).
  const oldDevices = await prisma.device.findMany({
    where: { deviceUuid: { startsWith: "demo-device-" } },
    select: { id: true },
  });
  await prisma.inspection.deleteMany({
    where: { deviceId: { in: oldDevices.map((device) => device.id) } },
  });

  const devices = [];
  for (const device of DEVICES) {
    devices.push(
      await prisma.device.upsert({
        where: { deviceUuid: device.deviceUuid },
        update: {},
        create: { ...device, userId: worker.id },
      })
    );
  }

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < INSPECTION_COUNT; i++) {
    const predicted = randomFrom(LABELS);
    const capturedAt = new Date(Date.now() - Math.random() * thirtyDays);
    // About 1 in 6 predictions was corrected by the worker.
    const corrected =
      Math.random() < 0.17
        ? randomFrom(LABELS.filter((label) => label !== predicted))
        : undefined;
    const objectKey = `inspections/demo/${i}.svg`;
    const svg = placeholderSvg(corrected ?? predicted);

    await uploadToMinio(objectKey, Buffer.from(svg), "image/svg+xml");

    await prisma.inspection.create({
      data: {
        userId: worker.id,
        deviceId: randomFrom(devices).id,
        status: "SYNCED",
        latitude: 33.6844 + (Math.random() - 0.5) * 0.05,
        longitude: 73.0479 + (Math.random() - 0.5) * 0.05,
        capturedAt,
        syncedAt: capturedAt,
        images: {
          create: {
            objectKey,
            originalFileName: `demo-${i}.svg`,
            mimeType: "image/svg+xml",
            fileSize: Buffer.byteLength(svg),
          },
        },
        predictions: {
          create: {
            predictedClass: predicted,
            confidence: randomConfidence(),
            inferenceSource: "ON_DEVICE",
            inferenceTimeMs: 60 + Math.floor(Math.random() * 40),
            isAccepted: corrected === undefined,
            ...(corrected !== undefined && { correctedClass: corrected }),
          },
        },
      },
    });
  }

  console.log(`Done: ${INSPECTION_COUNT} demo inspections on ${devices.length} devices.`);
}

main()
  .catch((error: unknown) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());