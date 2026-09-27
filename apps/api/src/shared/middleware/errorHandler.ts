// Registered once in index.ts via app.setErrorHandler(errorHandler).
// Fastify routes any error thrown (or rejected) inside a route handler
// here automatically — so controllers no longer need their own
// try/catch blocks just to format an error response.
//
// Always returns the same shape:
//   { "error": { "code": "...", "message": "...", "details": [...] } }

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // A Zod schema's .parse() throws this on invalid input.
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request failed validation",
        details: error.issues,
      },
    });
  }

  // A known, expected error from a service (not found, forbidden, etc).
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  // Anything else is unexpected — log it, but never leak internals to
  // the client (document §9.1: "fail loudly in development, gracefully
  // in production").
  request.log.error(error);
  return reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}