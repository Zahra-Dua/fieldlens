-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FIELD_WORKER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "WasteClass" AS ENUM ('PLASTIC', 'GLASS', 'METAL', 'PAPER', 'ORGANIC');

-- CreateEnum
CREATE TYPE "InferenceSource" AS ENUM ('ON_DEVICE', 'CLOUD');

-- CreateEnum
CREATE TYPE "ModelFormat" AS ENUM ('TFLITE', 'ONNX');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('DRAFT', 'STAGED', 'PRODUCTION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'FIELD_WORKER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceUuid" TEXT NOT NULL,
    "name" TEXT,
    "platform" "DevicePlatform" NOT NULL,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_images" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "modelVersionId" TEXT,
    "predictedClass" "WasteClass" NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL,
    "inferenceSource" "InferenceSource" NOT NULL,
    "inferenceTimeMs" INTEGER,
    "isAccepted" BOOLEAN,
    "correctedClass" "WasteClass",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "ModelFormat" NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "ModelStatus" NOT NULL DEFAULT 'DRAFT',
    "accuracy" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceUuid_key" ON "devices"("deviceUuid");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE INDEX "inspections_userId_idx" ON "inspections"("userId");

-- CreateIndex
CREATE INDEX "inspections_deviceId_idx" ON "inspections"("deviceId");

-- CreateIndex
CREATE INDEX "inspections_status_idx" ON "inspections"("status");

-- CreateIndex
CREATE INDEX "inspections_capturedAt_idx" ON "inspections"("capturedAt");

-- CreateIndex
CREATE INDEX "inspection_images_inspectionId_idx" ON "inspection_images"("inspectionId");

-- CreateIndex
CREATE INDEX "predictions_inspectionId_idx" ON "predictions"("inspectionId");

-- CreateIndex
CREATE INDEX "predictions_modelVersionId_idx" ON "predictions"("modelVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "model_versions_name_version_key" ON "model_versions"("name", "version");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_images" ADD CONSTRAINT "inspection_images_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
