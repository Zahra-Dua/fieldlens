import { WASTE_CLASSES, type SortBy, type SortOrder, type WasteClass } from "./types";

export const PAGE_SIZE = 20;

export interface InspectionFilters {
  page: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
  label: WasteClass | null;
  deviceId: string | null;
  /** A day, written YYYY-MM-DD. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Percent, 0 to 100. */
  minConf: number | null;
  maxConf: number | null;
}

const SORT_KEYS: readonly SortBy[] = ["capturedAt", "confidence", "label", "status"];

function parseInteger(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

function parseDay(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseDeviceId(value: string | null): string | null {
  return value !== null && /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}

/**
 * Reads the filters from the page address. Anything that is not valid is
 * ignored, so a hand-edited address can never break the page.
 */
export function parseFilters(params: URLSearchParams): InspectionFilters {
  const sortBy = SORT_KEYS.find((key) => key === params.get("sortBy")) ?? "capturedAt";
  const sortOrder: SortOrder = params.get("sortOrder") === "asc" ? "asc" : "desc";

  return {
    page: parseInteger(params.get("page"), 1, 100_000) ?? 1,
    sortBy,
    sortOrder,
    label: WASTE_CLASSES.find((label) => label === params.get("label")) ?? null,
    deviceId: parseDeviceId(params.get("device")),
    dateFrom: parseDay(params.get("from")),
    dateTo: parseDay(params.get("to")),
    minConf: parseInteger(params.get("minConf"), 0, 100),
    maxConf: parseInteger(params.get("maxConf"), 0, 100),
  };
}

/** Writes the filters to the page address. Default values are left out. */
export function serializeFilters(filters: InspectionFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.sortBy !== "capturedAt") params.set("sortBy", filters.sortBy);
  if (filters.sortOrder !== "desc") params.set("sortOrder", filters.sortOrder);
  if (filters.label !== null) params.set("label", filters.label);
  if (filters.deviceId !== null) params.set("device", filters.deviceId);
  if (filters.dateFrom !== null) params.set("from", filters.dateFrom);
  if (filters.dateTo !== null) params.set("to", filters.dateTo);
  if (filters.minConf !== null) params.set("minConf", String(filters.minConf));
  if (filters.maxConf !== null) params.set("maxConf", String(filters.maxConf));

  return params;
}

/** The filter values that mean "show everything". */
export const NO_FILTERS: Partial<InspectionFilters> = {
  label: null,
  deviceId: null,
  dateFrom: null,
  dateTo: null,
  minConf: null,
  maxConf: null,
  page: 1,
};

export function hasActiveFilters(filters: InspectionFilters): boolean {
  return (
    filters.label !== null ||
    filters.deviceId !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.minConf !== null ||
    filters.maxConf !== null
  );
}

/** Changes whenever a filter (not the page or the sorting) changes. */
export function filterKey(filters: InspectionFilters): string {
  return [
    filters.label,
    filters.deviceId,
    filters.dateFrom,
    filters.dateTo,
    filters.minConf,
    filters.maxConf,
  ].join("|");
}
