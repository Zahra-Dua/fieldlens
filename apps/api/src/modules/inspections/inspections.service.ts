// Core business logic for inspections — the idempotent bulk create,
// filtered/paginated listing, single fetch, and admin-only delete.

import { prisma } from "../../database/prisma";
import { AppError } from "../../shared/errors/AppError";
import type {
  CreateInspectionsInput,
  ListInspectionsQuery,
} from "./inspections.schemas";

export class InspectionsService {
  // ── Bulk create — the idempotent upsert ──────────────────────
  //
  // The Flutter app generates each inspection's UUID itself, offline. When
  // connectivity returns, it may retry the same batch (e.g. the response
  // was lost even though the server saved it). We MUST NOT create
  // duplicates on retry — that's what upsert-on-client-id buys us:
  //   - First time this id arrives  -> CREATE the inspection + prediction
  //   - Same id arrives again       -> just acknowledge, don't duplicate
  //
  // Wrapped in a transaction so a batch is all-or-nothing — a client
  // retrying a partially-failed batch won't end up with half of it synced
  // twice.
  async createBulk(userId: string, input: CreateInspectionsInput) {
    return prisma.$transaction(
      input.inspections.map((item) =>
        prisma.inspection.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            userId,
            deviceId: item.deviceId,
            status: item.status,
            latitude: item.latitude,
            longitude: item.longitude,
            capturedAt: item.capturedAt,
            syncedAt: item.status === "SYNCED" ? new Date() : null,
            predictions: {
              create: {
                predictedClass: item.predictedClass,
                confidence: item.confidence,
                inferenceSource: item.inferenceSource,
              },
            },
          },
          // Already exists (a retry) — don't recreate the prediction,
          // just refresh sync status so the client sees it as settled.
          update: {
            status: item.status,
            syncedAt: item.status === "SYNCED" ? new Date() : undefined,
          },
          include: { predictions: true },
        })
      )
    );
  }

  // ── List — paginated, filtered ────────────────────────────────
  // FIELD_WORKERs only ever see their own inspections; ADMINs see all.
  async list(
    requestingUserId: string,
    requestingUserRole: "ADMIN" | "FIELD_WORKER",
    query: ListInspectionsQuery
  ) {
    const where: Record<string, unknown> = {};

    if (requestingUserRole !== "ADMIN") {
      where.userId = requestingUserId;
    }
    if (query.deviceId) {
      where.deviceId = query.deviceId;
    }
    if (query.dateFrom || query.dateTo) {
      where.capturedAt = {
        ...(query.dateFrom && { gte: query.dateFrom }),
        ...(query.dateTo && { lte: query.dateTo }),
      };
    }
    if (query.label || query.minConfidence !== undefined) {
      where.predictions = {
        some: {
          ...(query.label && { predictedClass: query.label }),
          ...(query.minConfidence !== undefined && {
            confidence: { gte: query.minConfidence },
          }),
        },
      };
    }

    const [total, data] = await Promise.all([
      prisma.inspection.count({ where }),
      prisma.inspection.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { capturedAt: "desc" },
        include: { predictions: true, images: true },
      }),
    ]);

    return {
      data,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  // ── Get one ────────────────────────────────────────────────────
  async getById(
    id: string,
    requestingUserId: string,
    requestingUserRole: "ADMIN" | "FIELD_WORKER"
  ) {
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: { predictions: true, images: true },
    });

    if (!inspection) {
      throw new AppError("INSPECTION_NOT_FOUND", "Inspection not found", 404);
    }
    if (requestingUserRole !== "ADMIN" && inspection.userId !== requestingUserId) {
      throw new AppError("FORBIDDEN", "You do not have access to this inspection", 403);
    }

    return inspection;
  }

  // ── Delete — route-level requireRole("ADMIN") already enforces this
  // is admin-only; this method just does the deletion.
  async deleteById(id: string) {
    try {
      await prisma.inspection.delete({ where: { id } });
    } catch {
      throw new AppError("INSPECTION_NOT_FOUND", "Inspection not found", 404);
    }
  }
}

export const inspectionsService = new InspectionsService();