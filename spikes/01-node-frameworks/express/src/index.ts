// Spike 1 — Express implementation.
// Three endpoints: health check, create item (validated), list items.
// In-memory storage only — this is throwaway spike code, not production.

import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

const app = express();
app.use(express.json());

// ── In-memory "database" ──────────────────────────────────
type Item = { id: string; name: string; quantity: number };
const items: Item[] = [];

// ── Validation schema ──────────────────────────────────────
const createItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});

// ── Routes ────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/items", (req: Request, res: Response) => {
  const parsed = createItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", details: parsed.error.issues },
    });
  }

  const item: Item = {
    id: crypto.randomUUID(),
    ...parsed.data,
  };
  items.push(item);

  res.status(201).json(item);
});

app.get("/items", (_req: Request, res: Response) => {
  res.json(items);
});

// ── Error handler (catches anything thrown above) ────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: err.message } });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Express spike listening on http://localhost:${PORT}`);
});