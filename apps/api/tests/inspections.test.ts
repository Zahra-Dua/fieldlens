import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { signAccessToken } from "../src/shared/utils/jwt";

describe("Inspections", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /inspections is idempotent for duplicate client-generated IDs", async () => {
    const passwordHash = await argon2.hash("Password123!");
    const user = await prisma.user.upsert({
      where: { email: "inspection-test@example.com" },
      update: {},
      create: {
        name: "Inspection Tester",
        email: "inspection-test@example.com",
        passwordHash,
        role: "FIELD_WORKER",
      },
    });

    const device = await prisma.device.create({
      data: {
        userId: user.id,
        deviceUuid: "inspection-device-001",
        name: "Test device",
        platform: "ANDROID",
        appVersion: "1.0.0",
        osVersion: "Android 14",
      },
    });

    const token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });

    const payload = {
      inspections: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          deviceId: device.id,
          status: "SYNCED",
          latitude: 33.6844,
          longitude: 73.0479,
          capturedAt: "2026-09-25T12:00:00.000Z",
          predictedClass: "PLASTIC",
          confidence: 0.93,
          inferenceSource: "ON_DEVICE",
        },
      ],
    };

    const first = await supertest(app.server)
      .post("/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    const second = await supertest(app.server)
      .post("/inspections")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const total = await prisma.inspection.count({
      where: { id: "11111111-1111-4111-8111-111111111111" },
    });
    expect(total).toBe(1);

    await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("GET /inspections returns filtered, paginated results", async () => {
    const passwordHash = await argon2.hash("Password123!");
    const user = await prisma.user.upsert({
      where: { email: "inspection-list@example.com" },
      update: {},
      create: {
        name: "List Tester",
        email: "inspection-list@example.com",
        passwordHash,
        role: "FIELD_WORKER",
      },
    });

    const device = await prisma.device.create({
      data: {
        userId: user.id,
        deviceUuid: "inspection-device-002",
        name: "List device",
        platform: "ANDROID",
        appVersion: "1.0.0",
        osVersion: "Android 14",
      },
    });

    const token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });

    await prisma.inspection.create({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        userId: user.id,
        deviceId: device.id,
        status: "SYNCED",
        capturedAt: new Date("2026-09-20T10:00:00.000Z"),
        predictions: {
          create: {
            predictedClass: "PLASTIC",
            confidence: 0.92,
            inferenceSource: "ON_DEVICE",
          },
        },
      },
    });

    const response = await supertest(app.server)
      .get(
        `/inspections?page=1&pageSize=10&label=PLASTIC&deviceId=${device.id}&dateFrom=2026-09-19&dateTo=2026-09-25&minConfidence=0.9`
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(10);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.data)).toBe(true);

    await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("GET /inspections/:id allows owner and admin, blocks other users", async () => {
    const owner = await prisma.user.upsert({
      where: { email: "inspection-owner@example.com" },
      update: {},
      create: {
        name: "Owner",
        email: "inspection-owner@example.com",
        passwordHash: await argon2.hash("Password123!"),
        role: "FIELD_WORKER",
      },
    });

    const other = await prisma.user.upsert({
      where: { email: "inspection-other@example.com" },
      update: {},
      create: {
        name: "Other",
        email: "inspection-other@example.com",
        passwordHash: await argon2.hash("Password123!"),
        role: "FIELD_WORKER",
      },
    });

    const admin = await prisma.user.upsert({
      where: { email: "inspection-admin@example.com" },
      update: {},
      create: {
        name: "Admin",
        email: "inspection-admin@example.com",
        passwordHash: await argon2.hash("Password123!"),
        role: "ADMIN",
      },
    });

    const device = await prisma.device.create({
      data: {
        userId: owner.id,
        deviceUuid: "inspection-device-003",
        name: "Access device",
        platform: "ANDROID",
        appVersion: "1.0.0",
        osVersion: "Android 14",
      },
    });

    const inspection = await prisma.inspection.create({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        userId: owner.id,
        deviceId: device.id,
        status: "SYNCED",
        capturedAt: new Date("2026-09-24T10:00:00.000Z"),
        predictions: {
          create: {
            predictedClass: "METAL",
            confidence: 0.88,
            inferenceSource: "ON_DEVICE",
          },
        },
      },
    });

    const ownerToken = signAccessToken({ sub: owner.id, role: "FIELD_WORKER" });
    const otherToken = signAccessToken({ sub: other.id, role: "FIELD_WORKER" });
    const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const ownerResponse = await supertest(app.server)
      .get(`/inspections/${inspection.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    const adminResponse = await supertest(app.server)
      .get(`/inspections/${inspection.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const otherResponse = await supertest(app.server)
      .get(`/inspections/${inspection.id}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(ownerResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    expect(otherResponse.status).toBe(403);

    await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "inspection-owner@example.com",
            "inspection-other@example.com",
            "inspection-admin@example.com",
          ],
        },
      },
    });
  });

  it("DELETE /inspections/:id is admin-only", async () => {
    const user = await prisma.user.upsert({
      where: { email: "inspection-delete-user@example.com" },
      update: {},
      create: {
        name: "Delete User",
        email: "inspection-delete-user@example.com",
        passwordHash: await argon2.hash("Password123!"),
        role: "FIELD_WORKER",
      },
    });

    const admin = await prisma.user.upsert({
      where: { email: "inspection-delete-admin@example.com" },
      update: {},
      create: {
        name: "Delete Admin",
        email: "inspection-delete-admin@example.com",
        passwordHash: await argon2.hash("Password123!"),
        role: "ADMIN",
      },
    });

    const device = await prisma.device.create({
      data: {
        userId: user.id,
        deviceUuid: "inspection-device-004",
        name: "Delete device",
        platform: "ANDROID",
        appVersion: "1.0.0",
        osVersion: "Android 14",
      },
    });

    const inspection = await prisma.inspection.create({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        userId: user.id,
        deviceId: device.id,
        status: "PENDING",
        capturedAt: new Date("2026-09-25T09:00:00.000Z"),
        predictions: {
          create: {
            predictedClass: "ORGANIC",
            confidence: 0.81,
            inferenceSource: "ON_DEVICE",
          },
        },
      },
    });

    const userToken = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });
    const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

    const userResponse = await supertest(app.server)
      .delete(`/inspections/${inspection.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    const adminResponse = await supertest(app.server)
      .delete(`/inspections/${inspection.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(userResponse.status).toBe(403);
    expect(adminResponse.status).toBe(204);

    await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            "inspection-delete-user@example.com",
            "inspection-delete-admin@example.com",
          ],
        },
      },
    });
  });
});