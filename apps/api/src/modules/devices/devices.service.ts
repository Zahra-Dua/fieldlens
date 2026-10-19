import { prisma } from "../../database/prisma";
import { AppError } from "../../shared/errors/AppError";
import type { RegisterDeviceInput } from "./devices.schemas";

type Role = "ADMIN" | "FIELD_WORKER";

export type DeviceFleetStatus = "HEALTHY" | "STALE" | "OFFLINE" | "UNKNOWN";

export type DeviceFleetRow = {
  id: string;
  deviceUuid: string;
  name: string | null;
  platform: "ANDROID" | "IOS" | "WEB";
  currentModelVersion: string | null;
  lastSeenAt: string | null;
  status: DeviceFleetStatus;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  inspectionCount: number;
};

export class DevicesService {
  async register(userId: string, input: RegisterDeviceInput) {
    const existing = await prisma.device.findUnique({
      where: { deviceUuid: input.deviceUuid },
    });

    if (existing && existing.userId !== userId) {
      throw new AppError(
        "DEVICE_ALREADY_REGISTERED",
        "This device is already registered to another user",
        409,
      );
    }

    const device = await prisma.device.upsert({
      where: { deviceUuid: input.deviceUuid },
      update: {
        userId,
        name: input.name ?? undefined,
        platform: input.platform,
        appVersion: input.appVersion ?? undefined,
        osVersion: input.osVersion ?? undefined,
        currentModelVersion: input.modelVersion ?? undefined,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        deviceUuid: input.deviceUuid,
        name: input.name ?? null,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        osVersion: input.osVersion ?? null,
        currentModelVersion: input.modelVersion ?? null,
        lastSeenAt: new Date(),
      },
    });

    return device;
  }

  async listFleet(requestingUserId: string, requestingUserRole: Role) {
    const devices = await prisma.device.findMany({
      where: requestingUserRole === "ADMIN" ? {} : { userId: requestingUserId },
      select: {
        id: true,
        deviceUuid: true,
        name: true,
        platform: true,
        currentModelVersion: true,
        lastSeenAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            inspections: true,
          },
        },
      },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "asc" }],
    });

    const now = Date.now();
    const staleMs = 30 * 60 * 1000;

    return devices.map((device): DeviceFleetRow => {
      const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

      let status: DeviceFleetStatus;
      if (lastSeen === null) {
        status = "UNKNOWN";
      } else if (now - lastSeen > staleMs * 4) {
        status = "OFFLINE";
      } else if (now - lastSeen > staleMs) {
        status = "STALE";
      } else {
        status = "HEALTHY";
      }

      return {
        id: device.id,
        deviceUuid: device.deviceUuid,
        name: device.name,
        platform: device.platform,
        currentModelVersion: device.currentModelVersion,
        lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        status,
        user: device.user,
        inspectionCount: device._count.inspections,
      };
    });
  }
}

export const devicesService = new DevicesService();