import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { signAccessToken } from "../src/shared/utils/jwt";

describe("POST /inspections/:id/images", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts a valid image upload and stores metadata", async () => {
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
    const fakeImageBytes = Buffer.from("fake-image-bytes");

    const response = await supertest(app.server)
      .post(`/inspections/${inspection.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", fakeImageBytes, {
        filename: "sample.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(201);
    expect(response.body.mimeType).toBe("image/jpeg");
    expect(response.body.originalFileName).toBe("sample.jpg");
    expect(response.body.objectKey).toContain(inspection.id);

    await prisma.inspectionImage.deleteMany({ where: { inspectionId: inspection.id } });
    await prisma.prediction.deleteMany({ where: { inspectionId: inspection.id } });
    await prisma.inspection.deleteMany({ where: { userId: user.id } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects a non-image file with a clear error", async () => {
    const email = "upload-reject-test@example.com";
    const passwordHash = await argon2.hash("Password123!");

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: "Upload Reject Tester",
        email,
        passwordHash,
        role: "FIELD_WORKER",
      },
    });

    const uniqueSuffix = Date.now();
    const device = await prisma.device.create({
      data: {
        userId: user.id,
        deviceUuid: `upload-reject-device-${uniqueSuffix}`,
        name: "Reject Device",
        platform: "ANDROID",
        appVersion: "1.0.0",
        osVersion: "Android 14",
      },
    });

    const inspection = await prisma.inspection.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        status: "SYNCED",
        capturedAt: new Date("2026-09-25T12:00:00.000Z"),
        predictions: {
          create: {
            predictedClass: "PAPER",
            confidence: 0.8,
            inferenceSource: "ON_DEVICE",
          },
        },
      },
    });

    const token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });

    const response = await supertest(app.server)
      .post(`/inspections/${inspection.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("just text"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FILE_TYPE");

    await prisma.prediction.deleteMany({ where: { inspectionId: inspection.id } });
    await prisma.inspection.deleteMany({ where: { userId: user.id } });
    await prisma.device.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});