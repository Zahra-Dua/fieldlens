import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { signAccessToken } from "../src/shared/utils/jwt";

const USER_EMAIL = "device-register-test@example.com";
const DEVICE_UUID = "dev-uuid-register-test-001";

describe("POST /devices/register", () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

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
    userId = user.id;
    token = signAccessToken({ sub: user.id, role: "FIELD_WORKER" });
  });

  afterAll(async () => {
    await prisma.device.deleteMany({ where: { deviceUuid: DEVICE_UUID } });
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it("creates and updates a device for the authenticated user", async () => {
    const response = await supertest(app.server)
      .post("/devices/register")
      .set("Authorization", `Bearer ${token}`)
      .send({
        deviceUuid: DEVICE_UUID,
        name: "Android test phone",
        platform: "ANDROID",
        appVersion: "1.2.3",
        osVersion: "Android 14",
        modelVersion: "0.2.0",
      });

    expect(response.status).toBe(201);
    expect(response.body.deviceUuid).toBe(DEVICE_UUID);
    expect(response.body.platform).toBe("ANDROID");
    expect(response.body.appVersion).toBe("1.2.3");

    const storedDevice = await prisma.device.findUnique({
      where: { deviceUuid: DEVICE_UUID },
    });

    expect(storedDevice).toBeTruthy();
    expect(storedDevice?.userId).toBe(userId);
    expect(storedDevice?.name).toBe("Android test phone");
  });
});