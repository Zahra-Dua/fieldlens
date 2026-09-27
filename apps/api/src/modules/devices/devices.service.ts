import { prisma } from "../../database/prisma";
import { AppError } from "../../shared/errors/AppError";
import type { RegisterDeviceInput } from "./devices.schemas";

export class DevicesService {
  async register(userId: string, input: RegisterDeviceInput) {
    const existing = await prisma.device.findUnique({
      where: { deviceUuid: input.deviceUuid },
    });

    if (existing && existing.userId !== userId) {
      throw new AppError(
        "DEVICE_ALREADY_REGISTERED",
        "This device is already registered to another user",
        409
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
}

export const devicesService = new DevicesService();