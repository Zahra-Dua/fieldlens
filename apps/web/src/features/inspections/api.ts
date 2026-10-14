import { apiClient } from "../../lib/apiClient";
import { PAGE_SIZE, type InspectionFilters } from "./filters";
import type { InspectionPage } from "./types";

// The dates are days in the admin's own time zone. The API wants exact times.
function startOfDay(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function endOfDay(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

export async function fetchInspections(
  filters: InspectionFilters,
  signal?: AbortSignal,
): Promise<InspectionPage> {
  const response = await apiClient.get<InspectionPage>("/inspections", {
    params: {
      page: filters.page,
      pageSize: PAGE_SIZE,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      // axios leaves out parameters that are undefined.
      label: filters.label ?? undefined,
      dateFrom: filters.dateFrom === null ? undefined : startOfDay(filters.dateFrom),
      dateTo: filters.dateTo === null ? undefined : endOfDay(filters.dateTo),
      minConfidence: filters.minConf === null ? undefined : filters.minConf / 100,
      maxConfidence: filters.maxConf === null ? undefined : filters.maxConf / 100,
    },
    signal,
  });
  return response.data;
}
