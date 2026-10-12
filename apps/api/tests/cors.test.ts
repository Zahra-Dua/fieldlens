import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

describe("CORS", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows the dashboard origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not allow another origin", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/login",
      headers: {
        origin: "http://other-site.example",
        "access-control-request-method": "POST",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});