import type { FastifyReply, FastifyRequest } from "fastify";
import { latestModelQuerySchema } from "./models.schemas";
import { getLatestModel } from "./models.service";

export async function getLatestModelHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = latestModelQuerySchema.parse(request.query);
  const model = await getLatestModel(query, request.log);
  return reply.send(model);
}
