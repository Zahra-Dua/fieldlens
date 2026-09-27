import type { FastifyInstance } from "fastify";
import {
  createInspectionsHandler,
  listInspectionsHandler,
  getInspectionHandler,
  deleteInspectionHandler,
} from "./inspections.controller";
import { requireAuth, requireRole } from "../../shared/middleware/auth";

export async function inspectionsRoutes(app: FastifyInstance) {
  app.post(
    "/inspections",
    { preHandler: [requireAuth] },
    createInspectionsHandler
  );

  app.get(
    "/inspections",
    { preHandler: [requireAuth] },
    listInspectionsHandler
  );

  app.get<{ Params: { id: string } }>(
    "/inspections/:id",
    { preHandler: [requireAuth] },
    getInspectionHandler
  );

  app.delete<{ Params: { id: string } }>(
    "/inspections/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    deleteInspectionHandler
  );
}