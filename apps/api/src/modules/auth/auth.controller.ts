// Talks HTTP: reads the request, calls the service, shapes the response.
// No business logic lives here — that's all in auth.service.ts.

import type { FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { authService } from "./auth.service";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas";

// Small helper: turn a Zod validation failure into a consistent 400
// response shape. A proper centralised error handler comes on Day 5 —
// this is enough for now.
function sendValidationError(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({
    error: {
      code: "VALIDATION_FAILED",
      message: "Request body failed validation",
      details: error.issues,
    },
  });
}

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input);

    // Never return passwordHash, even accidentally.
    return reply.status(201).send({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error);
    if (error instanceof Error && error.message === "EMAIL_ALREADY_REGISTERED") {
      return reply.status(409).send({
        error: { code: "EMAIL_ALREADY_REGISTERED", message: "This email is already registered" },
      });
    }
    throw error;
  }
}

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const input = loginSchema.parse(request.body);
    const tokens = await authService.login(input);
    return reply.status(200).send(tokens);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error);
    if (error instanceof Error && error.message === "INVALID_CREDENTIALS") {
      return reply.status(401).send({
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" },
      });
    }
    throw error;
  }
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const input = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(input.refreshToken);
    return reply.status(200).send(tokens);
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error);
    if (
      error instanceof Error &&
      (error.message === "INVALID_REFRESH_TOKEN" ||
        error.message.toLowerCase().includes("expired") ||
        error.message.toLowerCase().includes("invalid"))
    ) {
      return reply.status(401).send({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token is invalid or expired" },
      });
    }
    throw error;
  }
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const input = refreshSchema.parse(request.body);
    await authService.logout(input.refreshToken);
    return reply.status(204).send();
  } catch (error) {
    if (error instanceof ZodError) return sendValidationError(reply, error);
    throw error;
  }
}

export async function meHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // request.user is attached by the auth middleware (requireAuth)
  // after it verifies the access token.
  const userId = request.user!.sub;
  const user = await authService.getById(userId);

  return reply.status(200).send({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  });
}

// TEMPORARY — proves requireRole("ADMIN") actually rejects non-admins with
// 403, per Day 3's acceptance criteria. Delete once Day 4 adds a real
// admin-only route (DELETE /inspections/:id).
export async function adminOnlyTestHandler(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.status(200).send({ message: "You are an admin ✅" });
}