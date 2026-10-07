import { z } from "zod";

export const latestModelQuerySchema = z
  .object({
    platform: z.enum(["android", "ios"]),
  })
  .strict();

const modelVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const modelMetadataSchema = z
  .object({
    version: z.string().regex(modelVersionPattern),
    platforms: z.array(z.enum(["android", "ios"])).min(1),
    quantization: z.string(),
    accuracy: z.number().min(0).max(1),
    notes: z.string().max(500),
    status: z.enum(["draft", "staged", "production"]),
    size_bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type LatestModelQuery = z.infer<typeof latestModelQuerySchema>;
export type ModelMetadata = z.infer<typeof modelMetadataSchema>;
