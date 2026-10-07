import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/middleware/auth";
import { getLatestModelHandler } from "./models.controller";

const modelMetadataJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "platforms",
    "quantization",
    "accuracy",
    "notes",
    "status",
    "size_bytes",
    "sha256",
    "created_at",
    "updated_at",
  ],
  properties: {
    version: { type: "string", pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$" },
    platforms: { type: "array", minItems: 1, items: { type: "string", enum: ["android", "ios"] } },
    quantization: { type: "string" },
    accuracy: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: "string", maxLength: 500 },
    status: { type: "string", enum: ["draft", "staged", "production"] },
    size_bytes: { type: "integer", minimum: 0 },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

const errorJsonSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
} as const;

export async function modelsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { platform: "android" | "ios" } }>(
    "/models/latest",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["Models"],
        summary: "Get the production model metadata for a platform",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["platform"],
          properties: {
            platform: { type: "string", enum: ["android", "ios"] },
          },
        },
        response: {
          200: modelMetadataJsonSchema,
          400: errorJsonSchema,
          401: errorJsonSchema,
          404: errorJsonSchema,
          502: errorJsonSchema,
          503: errorJsonSchema,
        },
      },
    },
    getLatestModelHandler,
  );
}
