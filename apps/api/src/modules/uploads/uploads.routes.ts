import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { uploadInspectionImageHandler } from "./uploads.controller";
import { requireAuth } from "../../shared/middleware/auth";

export async function uploadsRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
    },
  });

  app.post<{ Params: { id: string } }>(
    "/inspections/:id/images",
    { preHandler: [requireAuth] },
    uploadInspectionImageHandler
  );
}
