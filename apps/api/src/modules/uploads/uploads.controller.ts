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

export async function getInspectionImageHandler(
  request: FastifyRequest<{ Params: { id: string; imageId: string } }>,
  reply: FastifyReply
) {
  const { stream, mimeType } = await uploadsService.getInspectionImage(
    request.params.id,
    request.params.imageId,
    request.user!.sub,
    request.user!.role
  );

  return reply
    .header("Content-Type", mimeType)
    .header("Cache-Control", "private, max-age=3600")
    .send(stream);
}