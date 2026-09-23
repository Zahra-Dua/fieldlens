// src/modules/auth/auth.routes.ts
import type { FastifyInstance } from "fastify";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler,
  adminOnlyTestHandler,
} from "./auth.controller";
import { requireAuth, requireRole } from "../../shared/middleware/auth";


export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", registerHandler);

  app.post("/auth/login", {
    config: {
      rateLimit: { max: 5, timeWindow: "1 minute" },
    },
    handler: loginHandler,
  });

  app.post("/auth/refresh", refreshHandler);
  app.post("/auth/logout", logoutHandler);

  app.get("/auth/me", { preHandler: [requireAuth] }, meHandler);
  
  app.get(
  "/auth/admin-test",
  { preHandler: [requireAuth, requireRole("ADMIN")] },
  adminOnlyTestHandler
);
}