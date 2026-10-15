import { apiClient } from "../../lib/apiClient";
import type { ModelUpload, ModelVersion } from "./types";

export async function fetchModelVersions(
  signal?: AbortSignal,
): Promise<ModelVersion[]> {
  const response = await apiClient.get<ModelVersion[]>("/models", { signal });
  return response.data;
}

export async function uploadModelVersion(
  input: ModelUpload,
): Promise<ModelVersion> {
  const form = new FormData();

  form.set("version", input.version);
  for (const platform of input.platforms) {
    form.append("platforms", platform);
  }
  form.set("quantization", input.quantization);
  form.set("accuracy", String(input.accuracy));
  form.set("notes", input.notes);
  form.set("file", input.file);

  const response = await apiClient.post<ModelVersion>("/models", form);
  return response.data;
}

export async function stageModelVersion(
  version: string,
): Promise<ModelVersion> {
  const response = await apiClient.post<ModelVersion>(
    `/models/${encodeURIComponent(version)}/stage`,
  );
  return response.data;
}

export async function promoteModelVersion(
  version: string,
): Promise<ModelVersion> {
  const response = await apiClient.post<ModelVersion>(
    `/models/${encodeURIComponent(version)}/promote`,
  );
  return response.data;
}