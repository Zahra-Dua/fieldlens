// Runs before a protected route handler. Verifies the access token from
// the Authorization header and attaches the decoded payload to
// request.user, so later handlers/middleware can read who's calling and
// what role they have.

import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/jwt";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" },
    });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    request.user = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid access token" },
    });
  }
}

// A role gate — use AFTER requireAuth in a route's preHandler chain.
// e.g. preHandler: [requireAuth, requireRole("ADMIN")]
export function requireRole(role: "ADMIN" | "FIELD_WORKER") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== role) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: `Requires ${role} role` },
      });
    }
  };
}