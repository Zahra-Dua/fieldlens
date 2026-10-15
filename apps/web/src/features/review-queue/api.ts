import { apiClient } from "../../lib/apiClient";
import type { ReviewQueueFilters, ReviewQueueRow } from "./types";

function queryParams(filters: ReviewQueueFilters) {
  const startOfDay = (day: string) => new Date(`${day}T00:00:00`).toISOString();
  const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

  return {
    deviceId: filters.deviceId || undefined,
    dateFrom: filters.dateFrom ? startOfDay(filters.dateFrom) : undefined,
    dateTo: filters.dateTo ? endOfDay(filters.dateTo) : undefined,
    originalLabel: filters.originalLabel || undefined,
    correctedLabel: filters.correctedLabel || undefined,
    minConfidence: filters.minConfidence !== "" ? Number(filters.minConfidence) / 100 : undefined,
    maxConfidence: filters.maxConfidence !== "" ? Number(filters.maxConfidence) / 100 : undefined,
  };
}

export async function fetchReviewQueue(
  filters: ReviewQueueFilters,
  signal?: AbortSignal,
): Promise<ReviewQueueRow[]> {
  const response = await apiClient.get<ReviewQueueRow[]>("/inspections/review-queue", {
    params: queryParams(filters),
    signal,
  });
  return response.data;
}

export async function downloadReviewQueueCsv(filters: ReviewQueueFilters): Promise<Blob> {
  const response = await apiClient.get<Blob>("/inspections/review-queue/export", {
    params: queryParams(filters),
    responseType: "blob",
  });
  return response.data;
}
