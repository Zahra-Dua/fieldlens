// Spike 1 — Fastify implementation.
// Same three endpoints as the Express version: health, create item
// (validated), list items. In-memory storage — throwaway spike code.

import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { z } from "zod";

const app = Fastify({ logger: false }); // logger off for a fair benchmark vs Express

// ── In-memory "database" ──────────────────────────────────
type Item = { id: string; name: string; quantity: number };
const items: Item[] = [];

// ── Validation schema ──────────────────────────────────────
const createItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});

// ── Routes ────────────────────────────────────────────────
app.get("/health", async () => {
  return { status: "ok" };
});

app.post("/items", async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = createItemSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      error: { code: "VALIDATION_FAILED", details: parsed.error.issues },
    });
  }

  const item: Item = {
    id: crypto.randomUUID(),
    ...parsed.data,
  };
  items.push(item);

  return reply.status(201).send(item);
});

app.get("/items", async () => {
  return items;
});

const PORT = 3002;
app.listen({ port: PORT }, () => {
  console.log(`Fastify spike listening on http://localhost:${PORT}`);
});