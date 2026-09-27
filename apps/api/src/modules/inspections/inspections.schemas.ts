// Zod schemas for the Inspections module — validates both the bulk-create
// request body and the list/filter query string. .strict() on the object
// schemas rejects any field not explicitly listed here (Day 4 requirement:
// "Reject unknown fields").

import { z } from "zod";

// A single inspection, as the client (Flutter app) sends it. The id is
// CLIENT-GENERATED — this is what makes the create endpoint idempotent
// (see ADR 0005).
const inspectionInputSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID (client-generated)"),
    deviceId: z.string().uuid(),
    status: z.enum(["PENDING", "SYNCING", "SYNCED", "FAILED"]).default("SYNCED"),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    capturedAt: z.coerce.date(),
    predictedClass: z.enum(["PLASTIC", "GLASS", "METAL", "PAPER", "ORGANIC"]),
    confidence: z.number().min(0).max(1),
    inferenceSource: z.enum(["ON_DEVICE", "CLOUD"]),
  })
  .strict();

// The create endpoint is bulk-capable — the mobile client syncs a batch of
// inspections at once after reconnecting, not one at a time.
export const createInspectionsSchema = z
  .object({
    inspections: z.array(inspectionInputSchema).min(1).max(100),
  })
  .strict();

// Query params for GET /inspections — all optional, all filters combine
// with AND when present.
export const listInspectionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    label: z.enum(["PLASTIC", "GLASS", "METAL", "PAPER", "ORGANIC"]).optional(),
    deviceId: z.string().uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

export type CreateInspectionsInput = z.infer<typeof createInspectionsSchema>;
export type ListInspectionsQuery = z.infer<typeof listInspectionsQuerySchema>;