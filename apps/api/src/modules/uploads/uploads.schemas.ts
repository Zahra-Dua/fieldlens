import { z } from "zod";

export const uploadImageSchema = z.object({
  file: z.any(),
}).strict();

export type UploadImageInput = z.infer<typeof uploadImageSchema>;
