// Core business logic for inspections — the idempotent bulk create,
// filtered/paginated listing, single fetch, and admin-only delete.

import { prisma } from "../../database/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type {
  CreateInspectionsInput,
  ListInspectionsQuery,
  StatsInspectionsQuery,
} from "./inspections.schemas";

type Role = "ADMIN" | "FIELD_WORKER";

// A prediction below this confidence counts as "low confidence" in the
// dashboard stats. Keep it equal to kConfidenceThreshold in the Flutter app.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

// The filters that the list and the stats endpoints share.
interface ScopeFilters {
  deviceId?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  label?: string | undefined;
  minConfidence?: number | undefined;
  maxConfidence?: number | undefined;
}

// Every inspection joined with its newest prediction (or nothing, when it has
// none). The table and the charts both read from this, so they always agree.
const FROM_LATEST_PREDICTION = Prisma.sql`
  FROM inspections i
  LEFT JOIN LATERAL (
    SELECT "predictedClass", confidence
    FROM predictions
    WHERE "inspectionId" = i.id
    ORDER BY "createdAt" DESC
    LIMIT 1
  ) p ON true
`;

// The user can only pick a key from this list, so no user text ever reaches
// the SQL as a column name.
const SORT_COLUMNS = {
  capturedAt: Prisma.sql`i."capturedAt"`,
  confidence: Prisma.sql`p.confidence`,
  label: Prisma.sql`p."predictedClass"::text`,
  status: Prisma.sql`i.status::text`,
} as const;

function buildConditions(
  userId: string,
  role: Role,
  filters: ScopeFilters
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  // FIELD_WORKERs only ever see their own inspections; ADMINs see all.
  if (role !== "ADMIN") {
    conditions.push(Prisma.sql`i."userId" = ${userId}`);
  }
  if (filters.deviceId !== undefined) {
    conditions.push(Prisma.sql`i."deviceId" = ${filters.deviceId}`);
  }
  if (filters.dateFrom !== undefined) {
    conditions.push(Prisma.sql`i."capturedAt" >= ${filters.dateFrom}::timestamp`);
  }
  if (filters.dateTo !== undefined) {
    conditions.push(Prisma.sql`i."capturedAt" <= ${filters.dateTo}::timestamp`);
  }
  if (filters.label !== undefined) {
    conditions.push(Prisma.sql`p."predictedClass" = ${filters.label}::"WasteClass"`);
  }
  if (filters.minConfidence !== undefined) {
    conditions.push(Prisma.sql`p.confidence >= ${filters.minConfidence}::numeric`);
  }
  if (filters.maxConfidence !== undefined) {
    conditions.push(Prisma.sql`p.confidence <= ${filters.maxConfidence}::numeric`);
  }

  return conditions;
}

function whereClause(conditions: Prisma.Sql[]): Prisma.Sql {
  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

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
            ...(item.predictedClass !== undefined && {
              predictions: {
                create: {
                  predictedClass: item.predictedClass,
                  confidence: item.confidence!,
                  inferenceSource: item.inferenceSource!,
                  ...(item.correctedClass !== undefined && {
                    correctedClass: item.correctedClass,
                  }),
                  ...(item.isAccepted !== undefined && {
                    isAccepted: item.isAccepted,
                  }),
                },
              },
            }),
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

  // ── List — paginated, filtered, sorted ────────────────────────
  // Filtering, sorting and paging all happen in the database, so page 2 is
  // really page 2 of the filtered result, not of the unfiltered data.
  // Sorting by the prediction's confidence or label needs a join, which
  // Prisma's own orderBy cannot do for a one-to-many relation. So we pick the
  // ids with SQL, then load the full rows with Prisma.
  async list(
    requestingUserId: string,
    requestingUserRole: Role,
    query: ListInspectionsQuery
  ) {
    const where = whereClause(
      buildConditions(requestingUserId, requestingUserRole, query)
    );
    const orderColumn = SORT_COLUMNS[query.sortBy];
    const direction =
      query.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const offset = (query.page - 1) * query.pageSize;

    const [countRows, idRows] = await Promise.all([
      prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total ${FROM_LATEST_PREDICTION} ${where}`,
      // "i.id" is the last sort key, so rows with equal values keep a stable
      // order and no row is skipped or repeated between pages.
      prisma.$queryRaw<{ id: string }[]>`
        SELECT i.id ${FROM_LATEST_PREDICTION} ${where}
        ORDER BY ${orderColumn} ${direction} NULLS LAST, i.id ASC
        LIMIT ${query.pageSize} OFFSET ${offset}`,
    ]);

    const total = countRows[0]?.total ?? 0;
    const ids = idRows.map((row) => row.id);

    const rows = await prisma.inspection.findMany({
      where: { id: { in: ids } },
      include: {
        predictions: true,
        images: true,
        device: { select: { id: true, name: true, platform: true } },
      },
    });

    // findMany does not keep the order of the ids, so put it back.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined);

    return {
      data,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  // ── Stats — the numbers behind the dashboard charts ───────────
  // Grouped in the database, so it stays fast with many inspections.
  async stats(
    requestingUserId: string,
    requestingUserRole: Role,
    query: StatsInspectionsQuery
  ) {
    const base = buildConditions(requestingUserId, requestingUserRole, query);
    // The class and confidence charts only make sense for rows that have a
    // prediction.
    const withPrediction = whereClause([
      ...base,
      Prisma.sql`p.confidence IS NOT NULL`,
    ]);
    const all = whereClause(base);

    const [overTimeRows, distributionRows, histogramRows, lowRows] =
      await Promise.all([
        prisma.$queryRaw<{ day: string; count: number }[]>`
          SELECT to_char(date_trunc('day', i."capturedAt"), 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS count
          ${FROM_LATEST_PREDICTION} ${all}
          GROUP BY 1 ORDER BY 1`,
        prisma.$queryRaw<{ label: string; count: number }[]>`
          SELECT p."predictedClass"::text AS label, COUNT(*)::int AS count
          ${FROM_LATEST_PREDICTION} ${withPrediction}
          GROUP BY 1 ORDER BY 2 DESC, 1 ASC`,
        prisma.$queryRaw<{ bucket: number; count: number }[]>`
          SELECT LEAST(FLOOR(p.confidence * 10), 9)::int AS bucket,
                 COUNT(*)::int AS count
          ${FROM_LATEST_PREDICTION} ${withPrediction}
          GROUP BY 1 ORDER BY 1`,
        prisma.$queryRaw<{ total: number; low: number }[]>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (
                   WHERE p.confidence < ${LOW_CONFIDENCE_THRESHOLD}::numeric
                 )::int AS low
          ${FROM_LATEST_PREDICTION} ${withPrediction}`,
      ]);

    // Always return all 10 buckets, even the empty ones, so the chart
    // does not have to fill gaps.
    const countByBucket = new Map(
      histogramRows.map((row) => [row.bucket, row.count])
    );
    const confidenceHistogram = Array.from({ length: 10 }, (_, bucket) => ({
      from: bucket / 10,
      to: (bucket + 1) / 10,
      count: countByBucket.get(bucket) ?? 0,
    }));

    const total = lowRows[0]?.total ?? 0;
    const low = lowRows[0]?.low ?? 0;

    return {
      overTime: overTimeRows.map((row) => ({ date: row.day, count: row.count })),
      distribution: distributionRows,
      confidenceHistogram,
      lowConfidence: {
        threshold: LOW_CONFIDENCE_THRESHOLD,
        total,
        count: low,
        share: total > 0 ? low / total : 0,
      },
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
      include: {
        predictions: true,
        images: true,
        device: { select: { id: true, name: true, platform: true } },
      },
    });

    if (!inspection) {
      throw new AppError("INSPECTION_NOT_FOUND", "Inspection not found", 404);
    }
    if (requestingUserRole !== "ADMIN" && inspection.userId !== requestingUserId) {
      throw new AppError("FORBIDDEN", "You do not have access to this inspection", 403);
    }

    return inspection;
  }
    // ── Devices for the dashboard's device filter ─────────────────
  // Admins see every device; a field worker sees only their own.
  async listDevices(requestingUserId: string, requestingUserRole: Role) {
    return prisma.device.findMany({
      where: requestingUserRole === "ADMIN" ? {} : { userId: requestingUserId },
      select: { id: true, name: true, platform: true },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });
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