import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { prisma } from "../src/database/prisma";
import { signAccessToken } from "../src/shared/utils/jwt";

// Three inspections on one device, with known labels and confidences.
// Every request below filters by this device, so other data in the
// database (seed data, other tests) cannot change the results.
const FIXTURE = [
  { id: "55555555-5555-4555-8555-555555555551", label: "PLASTIC", confidence: 0.5, day: "2026-09-01" },
  { id: "55555555-5555-4555-8555-555555555552", label: "GLASS", confidence: 0.7, day: "2026-09-02" },
  { id: "55555555-5555-4555-8555-555555555553", label: "PLASTIC", confidence: 0.95, day: "2026-09-03" },
] as const;

interface ListRow {
  id: string;
  predictions: { confidence: string }[];
}

describe("Inspections dashboard queries", () => {
  let app: FastifyInstance;
  let deviceId: string;
  let adminToken: string;
  let workerToken: string;
  const emails = ["dash-admin@example.com", "dash-worker@example.com"];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const passwordHash = await argon2.hash("Password123!");
    const admin = await prisma.user.upsert({
      where: { email: emails[0]! },
      update: {},
      create: { name: "Dash Admin", email: emails[0]!, passwordHash, role: "ADMIN" },
    });
    const worker = await prisma.user.upsert({
      where: { email: emails[1]! },
      update: {},
      create: { name: "Dash Worker", email: emails[1]!, passwordHash, role: "FIELD_WORKER" },
    });

    const device = await prisma.device.create({
      data: {
        userId: worker.id,
        deviceUuid: "dashboard-device-001",
        name: "Dashboard device",
        platform: "ANDROID",
      },
    });
    deviceId = device.id;

    for (const item of FIXTURE) {
      await prisma.inspection.create({
        data: {
          id: item.id,
          userId: worker.id,
          deviceId: device.id,
          status: "SYNCED",
          capturedAt: new Date(`${item.day}T10:00:00.000Z`),
          predictions: {
            create: {
              predictedClass: item.label,
              confidence: item.confidence,
              inferenceSource: "ON_DEVICE",
            },
          },
        },
      });
    }

    adminToken = signAccessToken({ sub: admin.id, role: "ADMIN" });
    workerToken = signAccessToken({ sub: worker.id, role: "FIELD_WORKER" });
  });

  afterAll(async () => {
    await prisma.inspection.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  function get(path: string, token = adminToken) {
    return supertest(app.server).get(path).set("Authorization", `Bearer ${token}`);
  }

  function confidences(rows: ListRow[]): number[] {
    return rows.map((row) => Number(row.predictions[0]?.confidence));
  }

  it("sorts by confidence in both directions", async () => {
    const asc = await get(`/inspections?deviceId=${deviceId}&sortBy=confidence&sortOrder=asc`);
    const desc = await get(`/inspections?deviceId=${deviceId}&sortBy=confidence&sortOrder=desc`);

    expect(asc.status).toBe(200);
    expect(confidences(asc.body.data)).toEqual([0.5, 0.7, 0.95]);
    expect(confidences(desc.body.data)).toEqual([0.95, 0.7, 0.5]);
  });

  it("sorts by date, newest first by default", async () => {
    const response = await get(`/inspections?deviceId=${deviceId}`);

    expect(response.body.data.map((row: ListRow) => row.id)).toEqual([
      FIXTURE[2].id,
      FIXTURE[1].id,
      FIXTURE[0].id,
    ]);
  });

  it("filters by a confidence range in the database", async () => {
    const response = await get(
      `/inspections?deviceId=${deviceId}&minConfidence=0.6&maxConfidence=0.9`
    );

    expect(response.body.total).toBe(1);
    expect(confidences(response.body.data)).toEqual([0.7]);
  });

  it("filters by label and by date range", async () => {
    const byLabel = await get(`/inspections?deviceId=${deviceId}&label=PLASTIC`);
    const byDate = await get(
      `/inspections?deviceId=${deviceId}&dateFrom=2026-09-02T00:00:00.000Z&dateTo=2026-09-02T23:59:59.999Z`
    );

    expect(byLabel.body.total).toBe(2);
    expect(byDate.body.total).toBe(1);
    expect(byDate.body.data[0].id).toBe(FIXTURE[1].id);
  });

  it("pages through the filtered result without repeats", async () => {
    const base = `/inspections?deviceId=${deviceId}&pageSize=2&sortBy=confidence&sortOrder=asc`;
    const first = await get(`${base}&page=1`);
    const second = await get(`${base}&page=2`);

    expect(first.body.total).toBe(3);
    expect(first.body.totalPages).toBe(2);
    expect(first.body.data).toHaveLength(2);
    expect(second.body.data).toHaveLength(1);
    expect(confidences(second.body.data)).toEqual([0.95]);
  });

  it("rejects a confidence range where min is above max", async () => {
    const response = await get(`/inspections?minConfidence=0.9&maxConfidence=0.1`);

    expect(response.status).toBe(400);
  });

  it("rejects a sort column that is not allowed", async () => {
    const response = await get(`/inspections?sortBy=passwordHash`);

    expect(response.status).toBe(400);
  });

  it("returns the numbers for the charts", async () => {
    const response = await get(`/inspections/stats?deviceId=${deviceId}`);

    expect(response.status).toBe(200);
    expect(response.body.overTime).toEqual([
      { date: "2026-09-01", count: 1 },
      { date: "2026-09-02", count: 1 },
      { date: "2026-09-03", count: 1 },
    ]);
    expect(response.body.distribution).toEqual([
      { label: "PLASTIC", count: 2 },
      { label: "GLASS", count: 1 },
    ]);
    expect(response.body.confidenceHistogram).toHaveLength(10);
    expect(response.body.confidenceHistogram[5].count).toBe(1); // 0.5
    expect(response.body.confidenceHistogram[7].count).toBe(1); // 0.7
    expect(response.body.confidenceHistogram[9].count).toBe(1); // 0.95
    expect(response.body.lowConfidence).toMatchObject({ total: 3, count: 1 });
  });

  it("lets a field worker see only their own numbers", async () => {
    const response = await get(`/inspections/stats?deviceId=${deviceId}`, workerToken);

    expect(response.status).toBe(200);
    expect(response.body.lowConfidence.total).toBe(3);
  });
    it("lists the devices for the device filter", async () => {
    const asAdmin = await get("/inspections/devices");
    const asWorker = await get("/inspections/devices", workerToken);

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.map((device: { id: string }) => device.id)).toContain(deviceId);
    expect(asWorker.body.map((device: { id: string }) => device.id)).toContain(deviceId);
  });
});