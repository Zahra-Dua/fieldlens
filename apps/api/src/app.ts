// Builds and returns a fully-configured Fastify instance — but does NOT
// start listening. This is what makes the app testable: tests import
// buildApp() and send fake requests directly into it (via Fastify's
// `.inject()`), without needing a real network port. index.ts is the only
// place that actually calls `.listen()`.

import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { authRoutes } from "./modules/auth/auth.routes";
import { devicesRoutes } from "./modules/devices/devices.routes";
import { inspectionsRoutes } from "./modules/inspections/inspections.routes";
import { uploadsRoutes } from "./modules/uploads/uploads.routes";
import { errorHandler } from "./shared/middleware/errorHandler";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: undefined,
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    },
    genReqId: (req) => {
      const clientRequestId = req.headers["x-request-id"];

      if (typeof clientRequestId === "string" && clientRequestId.trim().length > 0) {
        return clientRequestId;
      }

      return randomUUID();
    },
    requestIdHeader: "x-request-id",
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      "incoming request",
    );
  });

  app.setErrorHandler(errorHandler);

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "FieldLens API",
        version: "1.0.0",
        description:
          "Offline-first inspection sync API for the FieldLens CS Internship project.",
      },
      servers: [{ url: "http://localhost:3000", description: "Local development" }],
      tags: [
        { name: "Auth", description: "Authentication and token lifecycle" },
        { name: "Devices", description: "Device registration and sync metadata" },
        { name: "Inspections", description: "Inspection creation, listing, and access checks" },
        { name: "Uploads", description: "Inspection image upload and MinIO storage" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    uiConfig: {
      persistAuthorization: true,
    },
  });

  // Global default; individual routes (like /auth/login) override this
  // with their own stricter config, as seen in auth.routes.ts.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(authRoutes);
  await app.register(devicesRoutes);
  await app.register(inspectionsRoutes);
  await app.register(uploadsRoutes);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}