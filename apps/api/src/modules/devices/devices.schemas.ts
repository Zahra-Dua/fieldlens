import { z } from "zod";

export const registerDeviceSchema = z
  .object({
    deviceUuid: z.string().min(1, "deviceUuid is required").max(255),
    name: z.string().min(1, "name must not be empty").max(100).optional(),
    platform: z.enum(["ANDROID", "IOS", "WEB"]),
    appVersion: z.string().min(1, "appVersion must not be empty").max(50).optional(),
    osVersion: z.string().min(1, "osVersion must not be empty").max(120).optional(),
    modelVersion: z.string().min(1, "modelVersion must not be empty").max(50).optional(),
  })
  .strict();

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
