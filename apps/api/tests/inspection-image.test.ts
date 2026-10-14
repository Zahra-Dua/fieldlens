import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { signAccessToken } from "../src/shared/utils/jwt";

// A real 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("GET /inspections/:id/images/:imageId", () => {
  let app: FastifyInstance;
  let deviceId: string;
  let inspectionId: string;
  let imageId: string;
  let ownerToken: string;
  let otherToken: string;
  const emails = ["image-owner@example.com", "image-other@example.com"];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await argon2.hash("Password123!");
    const owner = await prisma.user.upsert({
      where: { email: emails[0]! },
      update: {},
      create: { name: "Image Owner", email: emails[0]!, passwordHash, role: "FIELD_WORKER" },
    });
    const other = await prisma.user.upsert({
      where: { email: emails[1]! },
      update: {},
      create: { name: "Image Other", email: emails[1]!, passwordHash, role: "FIELD_WORKER" },
    });
    ownerToken = signAccessToken({ sub: owner.id, role: "FIELD_WORKER" });
    otherToken = signAccessToken({ sub: other.id, role: "FIELD_WORKER" });

    const device = await prisma.device.create({
      data: { userId: owner.id, deviceUuid: "image-device-001", platform: "ANDROID" },
    });
    deviceId = device.id;

    const inspection = await prisma.inspection.create({
      data: {
        id: "66666666-6666-4666-8666-666666666661",
        userId: owner.id,
        deviceId: device.id,
        status: "SYNCED",
        capturedAt: new Date("2026-09-10T10:00:00.000Z"),
      },
    });
    inspectionId = inspection.id;

    const upload = await supertest(app.server)
      .post(`/inspections/${inspectionId}/images`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", PNG, { filename: "pixel.png", contentType: "image/png" });
    imageId = upload.body.id as string;
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  function download(imageIdValue: string, token: string) {
    return supertest(app.server)
      .get(`/inspections/${inspectionId}/images/${imageIdValue}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("sends the stored picture to its owner", async () => {
    const response = await download(imageId, ownerToken);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(Buffer.from(response.body), PNG)).toBe(0);
  });

  it("blocks another field worker", async () => {
    const response = await download(imageId, otherToken);

    expect(response.status).toBe(403);
  });

  it("needs a token", async () => {
    const response = await supertest(app.server).get(
      `/inspections/${inspectionId}/images/${imageId}`
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 for an image id that does not exist", async () => {
    const response = await download("77777777-7777-4777-8777-777777777777", ownerToken);

    expect(response.status).toBe(404);
  });

  it("returns 404 when the file is missing in storage", async () => {
    const missing = await prisma.inspectionImage.create({
      data: {
        inspectionId,
        objectKey: "inspections/does-not-exist/missing.png",
        mimeType: "image/png",
        fileSize: 1,
      },
    });

    const response = await download(missing.id, ownerToken);

    expect(response.status).toBe(404);
  });
});