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
function makeMultipartPayload(options: { includeFile?: boolean } = {}) {
  const boundary = "fieldlens-model-upload-boundary";
  const fields = [
    ["version", "1.2.4"],
    ["platforms", "android"],
    ["platforms", "ios"],
    ["quantization", "float16"],
    ["accuracy", "0.92"],
    ["notes", "Test upload"],
  ];

  const parts = fields.map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );

  if (options.includeFile !== false) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="model.tflite"\r\nContent-Type: application/octet-stream\r\n\r\nfake-model-bytes\r\n`,
    );
  }

  parts.push(`--${boundary}--\r\n`);

  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: parts.join(""),
  };
}
describe("Models API", () => {
  let app: FastifyInstance;

  const token = signAccessToken({
    sub: "models-test-user",
    role: "FIELD_WORKER",
  });

  const adminToken = signAccessToken({
    sub: "models-admin-test-user",
    role: "ADMIN",
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

  describe("GET /models/latest", () => {
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

  describe("GET /models", () => {
    it("returns model versions from the ML service for an admin", async () => {
      vi.stubEnv("ML_SERVICE_URL", "http://ml.internal:8000/");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify([modelMetadata]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      const response = await app.inject({
        method: "GET",
        url: "/models",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([modelMetadata]);

      const call = vi.mocked(fetch).mock.calls.at(0);
      expect(call).toBeDefined();
      if (!call) {
        throw new Error("Expected the ML service to be called");
      }
      const requestedUrl = new URL(call[0].toString());
      expect(requestedUrl.origin).toBe("http://ml.internal:8000");
      expect(requestedUrl.pathname).toBe("/models");
    });

    it("rejects a field worker without calling the ML service", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.inject({
        method: "GET",
        url: "/models",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/models",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 502 when the ML service returns invalid model metadata", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify([{ ...modelMetadata, accuracy: 5 }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );

      const response = await app.inject({
        method: "GET",
        url: "/models",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe("ML_SERVICE_INVALID_RESPONSE");
    });

    it("returns 503 when the ML service cannot be reached", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

      const response = await app.inject({
        method: "GET",
        url: "/models",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("ML_SERVICE_UNAVAILABLE");
    });
  });
describe("POST /models/:version/promote", () => {
  it("promotes a version to production through the ML service", async () => {
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
      method: "POST",
      url: "/models/1.2.3/promote",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(modelMetadata);

    const call = vi.mocked(fetch).mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) {
      throw new Error("Expected the ML service to be called");
    }

    expect(new URL(call[0].toString()).pathname).toBe("/models/1.2.3/status");
    expect(call[1]?.method).toBe("PATCH");
    expect(call[1]?.body).toBe(JSON.stringify({ status: "production" }));
  });

  it("rejects a field worker without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/models/1.2.3/promote",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid version without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/models/not-a-version/promote",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns conflict when the ML service rejects the promotion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Cannot move draft to production" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/models/1.2.3/promote",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("MODEL_TRANSITION_REJECTED");
  });
});
describe("POST /models/:version/stage", () => {
  it("stages a model version through the ML service for an admin", async () => {
    vi.stubEnv("ML_SERVICE_URL", "http://ml.internal:8000/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...modelMetadata, status: "staged" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/models/1.2.3/stage",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      version: "1.2.3",
      status: "staged",
    });

    const call = vi.mocked(fetch).mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) {
      throw new Error("Expected the ML service to be called");
    }

    expect(new URL(call[0].toString()).pathname).toBe("/models/1.2.3/status");
    expect(call[1]?.method).toBe("PATCH");
    expect(call[1]?.body).toBe(JSON.stringify({ status: "staged" }));
  });

  it("rejects a field worker without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/models/1.2.3/stage",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid version without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/models/not-a-version/stage",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns conflict when the ML service rejects the transition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Cannot move production to staged" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/models/1.2.3/stage",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("MODEL_TRANSITION_REJECTED");
  });
});
  describe("GET /models/:version/download", () => {
    const modelBytes = new Uint8Array([0x54, 0x46, 0x4c, 0x33, 1, 2, 3, 4]);

    it("streams the model file from the ML service", async () => {
      vi.stubEnv("ML_SERVICE_URL", "http://ml.internal:8000/");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(modelBytes, { status: 200 })),
      );

      const response = await app.inject({
        method: "GET",
        url: "/models/1.2.3/download",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/octet-stream");
      expect(response.rawPayload).toEqual(Buffer.from(modelBytes));
      const call = vi.mocked(fetch).mock.calls.at(0);
      if (!call) {
        throw new Error("Expected the ML service to be called");
      }
      expect(new URL(call[0].toString()).pathname).toBe("/models/1.2.3/download");
    });

    it("rejects a version that is not semver without calling the ML service", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await app.inject({
        method: "GET",
        url: "/models/not-a-version/download",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 404 when the ML service does not have that version", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

      const response = await app.inject({
        method: "GET",
        url: "/models/9.9.9/download",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("MODEL_NOT_FOUND");
    });

    it("returns 503 when the ML service cannot be reached", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

      const response = await app.inject({
        method: "GET",
        url: "/models/1.2.3/download",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("ML_SERVICE_UNAVAILABLE");
    });

    it("requires an authenticated API client", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/models/1.2.3/download",
      });

      expect(response.statusCode).toBe(401);
    });
  });
  describe("POST /models", () => {
  it("uploads model metadata and file to the ML service for an admin", async () => {
    vi.stubEnv("ML_SERVICE_URL", "http://ml.internal:8000/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...modelMetadata, version: "1.2.4", status: "draft" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/models",
      headers: {
        authorization: `Bearer ${adminToken}`,
        ...makeMultipartPayload().headers,
      },
      payload: makeMultipartPayload().payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ version: "1.2.4", status: "draft" });

    const call = vi.mocked(fetch).mock.calls.at(0);
    expect(call).toBeDefined();
    if (!call) {
      throw new Error("Expected the ML service to be called");
    }

    expect(new URL(call[0].toString()).pathname).toBe("/models");
    expect(call[1]?.method).toBe("POST");

    const form = call[1]?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) {
      throw new Error("Expected multipart form data to be forwarded");
    }

    expect(form.get("version")).toBe("1.2.4");
    expect(form.getAll("platforms")).toEqual(["android", "ios"]);
    expect(form.get("quantization")).toBe("float16");
    expect(form.get("accuracy")).toBe("0.92");
    expect(form.get("notes")).toBe("Test upload");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("rejects a field worker without calling the ML service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const multipart = makeMultipartPayload();
    const response = await app.inject({
      method: "POST",
      url: "/models",
      headers: {
        authorization: `Bearer ${token}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the upload has no model file", async () => {
    const multipart = makeMultipartPayload({ includeFile: false });
    const response = await app.inject({
      method: "POST",
      url: "/models",
      headers: {
        authorization: `Bearer ${adminToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_MODEL_UPLOAD");
  });

  it("returns 409 when the model version already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Version 1.2.4 already exists" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const multipart = makeMultipartPayload();
    const response = await app.inject({
      method: "POST",
      url: "/models",
      headers: {
        authorization: `Bearer ${adminToken}`,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("MODEL_VERSION_EXISTS");
  });
});
});