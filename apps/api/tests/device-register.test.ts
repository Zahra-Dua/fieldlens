import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import argon2 from "argon2";

import { prisma } from "../src/database/prisma";
import { devicesRoutes } from "../src/modules/devices/devices.routes";
import { signAccessToken } from "../src/shared/utils/jwt";

const USER_EMAIL = "device-register-test@example.com";
const DEVICE_UUID = "dev-uuid-register-test-001";

test("POST /devices/register creates and updates a device for the authenticated user", async () => {
  const passwordHash = await argon2.hash("Password123!");

  const user = await prisma.user.upsert({
    where: { email: USER_EMAIL },
    update: {},
    create: {
      name: "Device Register Tester",
      email: USER_EMAIL,
      passwordHash,
      role: "FIELD_WORKER",
    },
  });

  const token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });
  const app = Fastify({ logger: false });
  await app.register(devicesRoutes);

  const response = await app.inject({
    method: "POST",
    url: "/devices/register",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      deviceUuid: DEVICE_UUID,
      name: "Android test phone",
      platform: "ANDROID",
      appVersion: "1.2.3",
      osVersion: "Android 14",
      modelVersion: "0.2.0",
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  const body = JSON.parse(response.body);
  assert.equal(body.deviceUuid, DEVICE_UUID);
  assert.equal(body.platform, "ANDROID");
  assert.equal(body.appVersion, "1.2.3");

  const storedDevice = await prisma.device.findUnique({
    where: { deviceUuid: DEVICE_UUID },
  });

  assert.ok(storedDevice);
  assert.equal(storedDevice?.userId, user.id);
  assert.equal(storedDevice?.name, "Android test phone");

  await prisma.device.deleteMany({ where: { deviceUuid: DEVICE_UUID } });
  await prisma.user.delete({ where: { id: user.id } });
});
