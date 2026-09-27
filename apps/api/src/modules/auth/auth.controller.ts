// Talks HTTP: reads the request, calls the service, shapes the response.
// No business logic and no error-formatting here — errors thrown by the
// service (AppError) or by schema.parse() (ZodError) are caught
// automatically by the global error handler (shared/middleware/errorHandler.ts).

import type { FastifyRequest, FastifyReply } from "fastify";
import { authService } from "./auth.service";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schemas";

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = registerSchema.parse(request.body);
  const user = await authService.register(input);

  // Never return passwordHash, even accidentally.
  return reply.status(201).send({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = loginSchema.parse(request.body);
  const tokens = await authService.login(input);
  return reply.status(200).send(tokens);
}

export async function refreshHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = refreshSchema.parse(request.body);
  const tokens = await authService.refresh(input.refreshToken);
  return reply.status(200).send(tokens);
}

export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const input = refreshSchema.parse(request.body);
  await authService.logout(input.refreshToken);
  return reply.status(204).send();
}

export async function meHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
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