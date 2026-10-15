import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../shared/errors/AppError";
import { latestModelQuerySchema, modelUploadMetadataSchema } from "./models.schemas";
import {
  downloadModel,
  getLatestModel,
  listModelVersions,
  promoteModelVersion,
  stageModelVersion,
  uploadModelVersion,
} from "./models.service";
import { z } from "zod";

export async function getLatestModelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = latestModelQuerySchema.parse(request.query);
  const model = await getLatestModel(query, request.log);
  return reply.send(model);
}

const downloadParamsSchema = z.object({
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
});

export async function downloadModelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { version } = downloadParamsSchema.parse(request.params);
  const file = await downloadModel(version, request.log);
  return reply.header("content-type", "application/octet-stream").send(file);
}

export async function listModelVersionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const models = await listModelVersions(request.log);
  return reply.send(models);
}

const promoteParamsSchema = z.object({
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
});

export async function promoteModelVersionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { version } = promoteParamsSchema.parse(request.params);
  const model = await promoteModelVersion(version, request.log);
  return reply.send(model);
}
export async function stageModelVersionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { version } = promoteParamsSchema.parse(request.params);
  const model = await stageModelVersion(version, request.log);
  return reply.send(model);
}
export async function uploadModelVersionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const fields: Record<string, unknown> = {};
  const platforms: string[] = [];
  let file: { bytes: Buffer; filename: string } | undefined;

  for await (const part of request.parts({
    limits: { files: 1, fields: 6, fileSize: 50 * 1024 * 1024 },
  })) {
    if (part.type === "file") {
      if (part.fieldname !== "file" || file !== undefined) {
        throw new AppError(
          "INVALID_MODEL_UPLOAD",
          "Unexpected or duplicate model file",
          400,
        );
      }
      file = {
        bytes: await part.toBuffer(),
        filename: part.filename,
      };
      continue;
    }

    if (typeof part.value !== "string") {
      throw new AppError(
        "INVALID_MODEL_UPLOAD",
        `Invalid model upload field: ${part.fieldname}`,
        400,
      );
    }

    if (part.fieldname === "platforms") {
      platforms.push(part.value);
    } else {
      if (part.fieldname in fields) {
        throw new AppError(
          "INVALID_MODEL_UPLOAD",
          `Duplicate model upload field: ${part.fieldname}`,
          400,
        );
      }
      fields[part.fieldname] = part.value;
    }
  }

  const metadata = modelUploadMetadataSchema.parse({ ...fields, platforms });
  if (file === undefined) {
    throw new AppError("INVALID_MODEL_UPLOAD", "A model file is required", 400);
  }

  const model = await uploadModelVersion(
    { ...metadata, file: file.bytes, filename: file.filename },
    request.log,
  );
  return reply.status(201).send(model);
}