import type { FastifyRequest, FastifyReply } from "fastify";
import { uploadsService } from "./uploads.service";

export async function uploadInspectionImageHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const file = await request.file();

  if (!file) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_FAILED",
        message: "A file upload is required",
        details: [],
      },
    });
  }

  const result = await uploadsService.uploadInspectionImage(
    request.params.id,
    request.user!.sub,
    request.user!.role,
    file
  );

  return reply.status(201).send(result);
}