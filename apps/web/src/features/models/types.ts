export type ModelPlatform = "android" | "ios";
export type ModelStatus = "draft" | "staged" | "production";

export interface ModelVersion {
  version: string;
  platforms: ModelPlatform[];
  quantization: string;
  accuracy: number;
  notes: string;
  status: ModelStatus;
  size_bytes: number;
  sha256: string;
  created_at: string;
  updated_at: string;
}

export interface ModelUpload {
  version: string;
  platforms: ModelPlatform[];
  quantization: string;
  accuracy: number;
  notes: string;
  file: File;
}