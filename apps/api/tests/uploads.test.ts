import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import argon2 from "argon2";
import { prisma } from "../src/database/prisma";
import { uploadsRoutes } from "../src/modules/uploads/uploads.routes";
import { signAccessToken } from "../src/shared/utils/jwt";

test("POST /inspections/:id/images accepts a valid image upload and stores metadata", async () => {
  const email = "upload-test@example.com";
  const passwordHash = await argon2.hash("Password123!");

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Upload Tester",
      email,
      passwordHash,
      role: "FIELD_WORKER",
    },
  });

  const uniqueSuffix = Date.now();
  const deviceUuid = `upload-device-${uniqueSuffix}`;
  const inspectionId = `aaaaaaaa-aaaa-4aaa-8aaa-${uniqueSuffix.toString().padStart(12, "0")}`;

  const device = await prisma.device.upsert({
    where: { deviceUuid },
    update: {},
    create: {
      userId: user.id,
      deviceUuid,
      name: "Upload Device",
      platform: "ANDROID",
      appVersion: "1.0.0",
      osVersion: "Android 14",
    },
  });

  const inspection = await prisma.inspection.create({
    data: {
      id: inspectionId,
      userId: user.id,
      deviceId: device.id,
      status: "SYNCED",
      capturedAt: new Date("2026-09-25T12:00:00.000Z"),
      predictions: {
        create: {
          predictedClass: "PLASTIC",
          confidence: 0.91,
          inferenceSource: "ON_DEVICE",
        },
      },
    },
  });

  const token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });
  const app = Fastify({ logger: false });
  await app.register(uploadsRoutes);

  const file = Buffer.from("fake-image-bytes");

  const form = new FormData();
  form.append("file", new Blob([file], { type: "image/jpeg" }), "sample.jpg");

  const response = await app.inject({
    method: "POST",
    url: `/inspections/${inspection.id}/images`,
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: form,
  });

  assert.equal(response.statusCode, 201, response.body);

  const body = JSON.parse(response.body);
  assert.equal(body.mimeType, "image/jpeg");
  assert.equal(body.originalFileName, "sample.jpg");
  assert.ok(body.objectKey.includes(inspection.id));

  await prisma.inspectionImage.deleteMany({ where: { inspectionId: inspection.id } });
  await prisma.prediction.deleteMany({ where: { inspectionId: inspection.id } });
  await prisma.inspection.deleteMany({ where: { userId: user.id } });
  await prisma.device.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
