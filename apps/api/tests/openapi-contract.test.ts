import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

describe("OpenAPI contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes a docs endpoint and documents the real routes the API exposes", async () => {
    const docsResponse = await app.inject({ method: "GET", url: "/docs/json" });
    expect(docsResponse.statusCode).toBe(200);

    const spec = docsResponse.json();
    const paths = Object.keys(spec.paths ?? {});

    const expectedRoutes = [
      "/auth/register",
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/me",
      "/devices/register",
      "/inspections",
      "/inspections/{id}",
      "/inspections/{id}/images",
      "/health",
    ];

    for (const route of expectedRoutes) {
      expect(paths).toContain(route);
    }

    expect(paths.length).toBeGreaterThanOrEqual(expectedRoutes.length);
  });
});
