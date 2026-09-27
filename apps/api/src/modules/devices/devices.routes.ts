import type { FastifyInstance } from "fastify";
import { registerDeviceHandler } from "./devices.controller";
import { requireAuth } from "../../shared/middleware/auth";

export async function devicesRoutes(app: FastifyInstance) {
  app.post(
    "/devices/register",
    { preHandler: [requireAuth] },
    registerDeviceHandler
  );
}
