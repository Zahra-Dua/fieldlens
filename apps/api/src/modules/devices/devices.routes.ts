import type { FastifyInstance } from "fastify";
import {
  listDevicesFleetHandler,
  registerDeviceHandler,
} from "./devices.controller";
import { requireAuth } from "../../shared/middleware/auth";

export async function devicesRoutes(app: FastifyInstance) {
  app.post(
    "/devices/register",
    { preHandler: [requireAuth] },
    registerDeviceHandler,
  );

  app.get(
    "/devices",
    { preHandler: [requireAuth] },
    listDevicesFleetHandler,
  );
}