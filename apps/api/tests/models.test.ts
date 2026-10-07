import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { signAccessToken } from "../src/shared/utils/jwt";

const modelMetadata = {
  version: "1.2.3",
  platforms: ["android", "ios"],
  quantization: "float32",
  accuracy: 0.9177,
  notes: "Production model",
  status: "production",
  size_bytes: 1024,
  sha256: "a".repeat(64),
  created_at: "2026-10-07T07:00:00Z",
  updated_at: "2026-10-07T07:00:00Z",
};

describe("GET /models/latest", () => {
  let app: FastifyInstance;
  const token = signAccessToken({
    sub: "models-test-user",
    role: "FIELD_WORKER",
  });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns validated metadata from the ML service for the requested platform", async () => {
    vi.stubEnv("ML_SERVICE_URL", "http://ml.internal:8000/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(modelMetadata), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=android",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(modelMetadata);
    const call = vi.mocked(fetch).mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) {
      throw new Error("Expected the ML service to be called");
    }
    const requestedUrl = new URL(call[0].toString());
    expect(requestedUrl.origin).toBe("http://ml.internal:8000");
    expect(requestedUrl.pathname).toBe("/models/latest");
    expect(requestedUrl.searchParams.get("platform")).toBe("android");
  });

  it("rejects unsupported platforms without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=web",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the ML service has no production model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=ios",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("MODEL_NOT_FOUND");
  });

  it("returns 503 when the ML service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=android",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("ML_SERVICE_UNAVAILABLE");
  });

  it("returns 502 instead of forwarding invalid model metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...modelMetadata, accuracy: 5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=android",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("ML_SERVICE_INVALID_RESPONSE");
  });

  it("requires an authenticated API client", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/models/latest?platform=android",
    });

    expect(response.statusCode).toBe(401);
  });
});
