// src/shared/middleware/requireRole.ts
import type { FastifyRequest, FastifyReply } from "fastify";

export function requireRole(...allowedRoles: Array<"ADMIN" | "FIELD_WORKER">) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    // requireAuth must run before this and set request.user
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have permission to access this resource" },
      });
    }
  };
}