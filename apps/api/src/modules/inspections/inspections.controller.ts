// Talks HTTP only. No error formatting here — thrown errors (AppError,
// ZodError) are caught by the global error handler.

import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyRequest, FastifyReply } from "fastify";
import { inspectionsService } from "./inspections.service";
import { subscribeToInspectionEvents } from "./inspection-events";
import {
  createInspectionsSchema,
  listInspectionsQuerySchema,
  reviewQueueQuerySchema,
  statsInspectionsQuerySchema,
} from "./inspections.schemas";

export async function createInspectionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const input = createInspectionsSchema.parse(request.body);
  const result = await inspectionsService.createBulk(request.user!.sub, input);
  return reply.status(201).send({ inspections: result });
}

export async function listInspectionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = listInspectionsQuerySchema.parse(request.query);
  const result = await inspectionsService.list(
    request.user!.sub,
    request.user!.role,
    query,
  );
  return reply.status(200).send(result);
}

export async function getInspectionHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const inspection = await inspectionsService.getById(
    request.params.id,
    request.user!.sub,
    request.user!.role,
  );
  return reply.status(200).send(inspection);
}

export async function deleteInspectionHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  await inspectionsService.deleteById(request.params.id);
  return reply.status(204).send();
}

export async function statsInspectionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = statsInspectionsQuerySchema.parse(request.query);
  const result = await inspectionsService.stats(
    request.user!.sub,
    request.user!.role,
    query,
  );
  return reply.status(200).send(result);
}
export async function listInspectionDevicesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const devices = await inspectionsService.listDevices(
    request.user!.sub,
    request.user!.role,
  );
  return reply.status(200).send(devices);
}

export async function listReviewQueueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = reviewQueueQuerySchema.parse(request.query);
  const result = await inspectionsService.listReviewQueue(
    request.user!.sub,
    request.user!.role,
    query,
  );
  return reply.status(200).send(result);
}

export async function exportReviewQueueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const query = reviewQueueQuerySchema.parse(request.query);
  const csv = await inspectionsService.exportReviewQueueCsv(
    request.user!.sub,
    request.user!.role,
    query,
  );
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header(
      "content-disposition",
      'attachment; filename="fieldlens-review-queue.csv"',
    )
    .send(`\uFEFF${csv}`);
}

export async function inspectionEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  reply.hijack();
  const response = reply.raw;
  const corsHeaders: OutgoingHttpHeaders = {};
  for (const name of [
    "access-control-allow-origin",
    "access-control-allow-credentials",
    "access-control-expose-headers",
    "vary",
  ]) {
    const value = reply.getHeader(name);
    if (value !== undefined) {
      corsHeaders[name] = value;
    }
  }
  response.writeHead(200, {
    ...corsHeaders,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write("retry: 5000\n\n");

  const unsubscribe = subscribeToInspectionEvents((event) => {
    response.write(`event: ${event.type}\ndata: {}\n\n`);
  });
  const heartbeat = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 25_000);
  heartbeat.unref();

  response.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
  request.log.info("Admin inspection event stream connected");
}
