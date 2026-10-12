import type { FastifyReply, FastifyRequest } from "fastify";
import { latestModelQuerySchema } from "./models.schemas";
import { downloadModel, getLatestModel } from "./models.service";
import z from "zod";

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