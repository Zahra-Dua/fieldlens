import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { signAccessToken } from "../src/shared/utils/jwt";

describe("CORS", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await app.listen({ host: "127.0.0.1", port: 0 });
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
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
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

  it("preserves CORS headers on the authenticated SSE stream", async () => {
    const controller = new AbortController();
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port.");
    }
    const response = await fetch(
      `http://127.0.0.1:${address.port}/inspections/events`,
      {
        headers: {
          origin: "http://localhost:5173",
          authorization: `Bearer ${signAccessToken({
            sub: "cors-admin",
            role: "ADMIN",
          })}`,
        },
        signal: controller.signal,
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    controller.abort();
    await response.body?.cancel().catch(() => undefined);
  });
});
