import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/shared/middleware/errorHandler";

// A tiny app with only the error handler and a very strict rate limit,
// so the test does not need a database.
async function buildTestApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(rateLimit, { max: 1, timeWindow: "1 minute" });
  app.get("/ping", async () => ({ ok: true }));
  app.get("/boom", async () => {
    throw new Error("secret internal detail");
  });
  return app;
}

describe("errorHandler", () => {
  it("keeps the 429 status when the rate limit is hit", async () => {
    const app = await buildTestApp();

    const first = await app.inject({ method: "GET", url: "/ping" });
    const second = await app.inject({ method: "GET", url: "/ping" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe("RATE_LIMITED");
  });

  it("still returns 500 and hides details for unexpected errors", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.message).toBe("Something went wrong");
  });
});