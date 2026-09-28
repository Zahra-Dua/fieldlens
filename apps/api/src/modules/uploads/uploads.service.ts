import crypto from "node:crypto";
import { prisma } from "../../database/prisma";
import { AppError } from "../../shared/errors/AppError";
import { uploadToMinio } from "../../shared/storage/minio";
import type { MultipartFile } from "@fastify/multipart";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class UploadsService {
  async uploadInspectionImage(inspectionId: string, userId: string, userRole: "ADMIN" | "FIELD_WORKER", file: MultipartFile) {
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, userId: true },
    });

    if (!inspection) {
      throw new AppError("INSPECTION_NOT_FOUND", "Inspection not found", 404);
    }

    // Same ownership rule as inspections.service.getById — admins can
    // attach images to anyone's inspection, field workers only their own.
    if (userRole !== "ADMIN" && inspection.userId !== userId) {
      throw new AppError("FORBIDDEN", "You do not have access to this inspection", 403);
    }

    const mimeType = file.mimetype;
    const originalFileName = file.filename || "upload";

    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError("INVALID_FILE_TYPE", "Only JPG, PNG, and WebP images are allowed", 400);
    }

    // Read the whole stream FIRST — only then do we know the real size.
    // We also rely on @fastify/multipart's own `limits.fileSize` (set in
    // uploads.routes.ts) to stop the stream early on huge files; that
    // sets `file.file.truncated = true` rather than throwing, so we
    // check that flag after consuming the stream.
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    if (file.file.truncated) {
      throw new AppError(
        "INVALID_FILE_SIZE",
        `Image exceeds the maximum allowed size of ${MAX_IMAGE_SIZE_BYTES} bytes`,
        400
      );
    }

    if (buffer.length === 0) {
      throw new AppError("INVALID_FILE_SIZE", "Uploaded file is empty", 400);
    }

    const extension = mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";

    const objectKey = `inspections/${inspectionId}/${crypto.randomUUID()}.${extension}`;

    await uploadToMinio(objectKey, buffer, mimeType);

    const stored = await prisma.inspectionImage.create({
      data: {
        inspectionId,
        objectKey,
        originalFileName,
        mimeType,
        fileSize: buffer.length,
        width: null,
        height: null,
      },
    });

    return {
      id: stored.id,
      inspectionId: stored.inspectionId,
      objectKey: stored.objectKey,
      originalFileName: stored.originalFileName,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
    };
  }
}

export const uploadsService = new UploadsService();