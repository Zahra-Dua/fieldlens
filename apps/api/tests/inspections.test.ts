import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import argon2 from "argon2";

import { prisma } from "../src/database/prisma";
import { inspectionsRoutes } from "../src/modules/inspections/inspections.routes";
import { signAccessToken } from "../src/shared/utils/jwt";

const USER_EMAIL = "inspection-test@example.com";

test("POST /inspections is idempotent for duplicate client-generated IDs", async () => {
  const passwordHash = await argon2.hash("Password123!");

  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: {},
    create: {
      name: "Inspection Tester",
      email: USER_EMAIL,
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

  const app = Fastify({ logger: false });
  await app.register(inspectionsRoutes);

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

  const first = await app.inject({
    method: "POST",
    url: "/inspections",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

  const second = await app.inject({
    method: "POST",
    url: "/inspections",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

  assert.equal(first.statusCode, 201);
  assert.equal(second.statusCode, 201);

  const total = await prisma.inspection.count({
    where: { id: "11111111-1111-4111-8111-111111111111" },
  });

  assert.equal(total, 1);

  await prisma.inspection.deleteMany({
    where: { deviceId: device.id },
  });
  await prisma.device.delete({ where: { id: device.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

test("GET /inspections returns filtered, paginated results", async () => {
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
  const app = Fastify({ logger: false });
  await app.register(inspectionsRoutes);

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

  const response = await app.inject({
    method: "GET",
    url: `/inspections?page=1&pageSize=10&label=PLASTIC&deviceId=${device.id}&dateFrom=2026-09-19&dateTo=2026-09-25&minConfidence=0.9`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(response.statusCode, 200);

  const body = JSON.parse(response.body);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 10);
  assert.ok(body.total >= 1);
  assert.ok(Array.isArray(body.data));

  await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
  await prisma.device.delete({ where: { id: device.id } });
  await prisma.user.delete({ where: { id: user.id } });
});

test("GET /inspections/:id allows owner and admin, blocks other users", async () => {
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

  const app = Fastify({ logger: false });
  await app.register(inspectionsRoutes);

  const ownerToken = signAccessToken({ sub: owner.id, role: "FIELD_WORKER" });
  const otherToken = signAccessToken({ sub: other.id, role: "FIELD_WORKER" });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

  const ownerResponse = await app.inject({
    method: "GET",
    url: `/inspections/${inspection.id}`,
    headers: { authorization: `Bearer ${ownerToken}` },
  });

  const adminResponse = await app.inject({
    method: "GET",
    url: `/inspections/${inspection.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });

  const otherResponse = await app.inject({
    method: "GET",
    url: `/inspections/${inspection.id}`,
    headers: { authorization: `Bearer ${otherToken}` },
  });

  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(adminResponse.statusCode, 200);
  assert.equal(otherResponse.statusCode, 403);

  await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
  await prisma.device.delete({ where: { id: device.id } });
  await prisma.user.deleteMany({
    where: {
      email: { in: ["inspection-owner@example.com", "inspection-other@example.com", "inspection-admin@example.com"] },
    },
  });
});

test("DELETE /inspections/:id is admin-only", async () => {
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

  const app = Fastify({ logger: false });
  await app.register(inspectionsRoutes);

  const userToken = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });
  const adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });

  const userResponse = await app.inject({
    method: "DELETE",
    url: `/inspections/${inspection.id}`,
    headers: { authorization: `Bearer ${userToken}` },
  });

  const adminResponse = await app.inject({
    method: "DELETE",
    url: `/inspections/${inspection.id}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });

  assert.equal(userResponse.statusCode, 403);
  assert.equal(adminResponse.statusCode, 204);

  await prisma.inspection.deleteMany({ where: { deviceId: device.id } });
  await prisma.device.delete({ where: { id: device.id } });
  await prisma.user.deleteMany({
    where: {
      email: { in: ["inspection-delete-user@example.com", "inspection-delete-admin@example.com"] },
    },
  });
});