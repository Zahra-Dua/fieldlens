export type DevicePlatform = "ANDROID" | "IOS" | "WEB";
export type DeviceFleetStatus = "HEALTHY" | "STALE" | "OFFLINE" | "UNKNOWN";

export interface DeviceFleetRow {
  id: string;
  deviceUuid: string;
  name: string | null;
  platform: DevicePlatform;
  currentModelVersion: string | null;
  lastSeenAt: string | null;
  status: DeviceFleetStatus;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  inspectionCount: number;
}
