import "dotenv/config"; // must load env vars before anything reads process.env (JWT secrets etc.)
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { authRoutes } from "./modules/auth/auth.routes";

const app = Fastify({
  logger: true,
});

const start = async () => {
  try {
    // Global default; individual routes (like /auth/login) override this
    // with their own stricter config, as seen in auth.routes.ts.
    await app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
    });

    await app.register(authRoutes);

    app.get("/health", async () => {
      return { status: "ok" };
    });

    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();