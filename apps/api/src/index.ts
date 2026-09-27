import "dotenv/config"; // must load env vars before anything reads process.env (JWT secrets etc.)
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./modules/auth/auth.routes";
import { devicesRoutes } from "./modules/devices/devices.routes";
import { inspectionsRoutes } from "./modules/inspections/inspections.routes";
import { uploadsRoutes } from "./modules/uploads/uploads.routes";
import { errorHandler } from "./shared/middleware/errorHandler";

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

const start = async () => {
  try {
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

    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();