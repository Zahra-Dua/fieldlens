// Talks HTTP only. No error formatting here — thrown errors (AppError,
// ZodError) are caught by the global error handler.

import type { FastifyRequest, FastifyReply } from "fastify";
import { inspectionsService } from "./inspections.service";
import {
  createInspectionsSchema,
  listInspectionsQuerySchema,
} from "./inspections.schemas";

export async function createInspectionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = createInspectionsSchema.parse(request.body);
  const result = await inspectionsService.createBulk(request.user!.sub, input);
  return reply.status(201).send({ inspections: result });
}

export async function listInspectionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const query = listInspectionsQuerySchema.parse(request.query);
  const result = await inspectionsService.list(
    request.user!.sub,
    request.user!.role,
    query
  );
  return reply.status(200).send(result);
}

export async function getInspectionHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const inspection = await inspectionsService.getById(
    request.params.id,
    request.user!.sub,
    request.user!.role
  );
  return reply.status(200).send(inspection);
}

export async function deleteInspectionHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  await inspectionsService.deleteById(request.params.id);
  return reply.status(204).send();
}