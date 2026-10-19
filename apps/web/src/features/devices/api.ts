import { apiClient } from "../../lib/apiClient";
import type { DeviceFleetRow } from "./types";

export async function fetchDeviceFleet(signal?: AbortSignal): Promise<DeviceFleetRow[]> {
  const response = await apiClient.get<DeviceFleetRow[]>("/devices", { signal });
  return response.data;
}
