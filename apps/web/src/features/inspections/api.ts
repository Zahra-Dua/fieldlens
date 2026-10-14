import { apiClient } from "../../lib/apiClient";
import { PAGE_SIZE, type InspectionFilters } from "./filters";
import type { Inspection, InspectionDevice, InspectionPage, InspectionStats } from "./types";

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
      deviceId: filters.deviceId ?? undefined,
      dateFrom: filters.dateFrom === null ? undefined : startOfDay(filters.dateFrom),
      dateTo: filters.dateTo === null ? undefined : endOfDay(filters.dateTo),
      minConfidence: filters.minConf === null ? undefined : filters.minConf / 100,
      maxConfidence: filters.maxConf === null ? undefined : filters.maxConf / 100,
    },
    signal,
  });
  return response.data;
}
export async function fetchInspectionStats(
  filters: InspectionFilters,
  signal?: AbortSignal,
): Promise<InspectionStats> {
  const response = await apiClient.get<InspectionStats>("/inspections/stats", {
    params: {
      label: filters.label ?? undefined,
      deviceId: filters.deviceId ?? undefined,
      dateFrom: filters.dateFrom === null ? undefined : startOfDay(filters.dateFrom),
      dateTo: filters.dateTo === null ? undefined : endOfDay(filters.dateTo),
      minConfidence: filters.minConf === null ? undefined : filters.minConf / 100,
      maxConfidence: filters.maxConf === null ? undefined : filters.maxConf / 100,
    },
    signal,
  });
  return response.data;
}

/** The devices the admin can pick in the device filter. */
export async function fetchDevices(signal?: AbortSignal): Promise<InspectionDevice[]> {
  const response = await apiClient.get<InspectionDevice[]>("/inspections/devices", { signal });
  return response.data;
}

export async function fetchInspection(id: string, signal?: AbortSignal): Promise<Inspection> {
  const response = await apiClient.get<Inspection>(`/inspections/${encodeURIComponent(id)}`, {
    signal,
  });
  return response.data;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read the image."));
      }
    };
    reader.onerror = () => {
      reject(new Error("Could not read the image."));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Loads a picture through apiClient, so the login token is sent. A plain
 * <img src="..."> cannot send a token. The picture becomes a data URL, which
 * needs no clean-up when the page closes (an object URL would).
 */
export async function fetchImageDataUrl(
  inspectionId: string,
  imageId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiClient.get<Blob>(
    `/inspections/${encodeURIComponent(inspectionId)}/images/${encodeURIComponent(imageId)}`,
    { responseType: "blob", signal },
  );
  return blobToDataUrl(response.data);
}
