import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../shared/errors/AppError";
import {
  modelMetadataSchema,
  ModelUploadMetadata,
  type LatestModelQuery,
  type ModelMetadata,
} from "./models.schemas";
import z from "zod";

const ML_SERVICE_TIMEOUT_MS = 5_000;

export async function getLatestModel(
  { platform }: LatestModelQuery,
  logger: FastifyBaseLogger,
): Promise<ModelMetadata> {
  const baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000";
  const url = new URL("/models/latest", baseUrl);
  url.searchParams.set("platform", platform);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(ML_SERVICE_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error, platform }, "Could not reach the ML service");
    throw new AppError(
      "ML_SERVICE_UNAVAILABLE",
      "The ML service is unavailable",
      503,
    );
  }

  if (response.status === 404) {
    throw new AppError(
      "MODEL_NOT_FOUND",
      `No production model is available for ${platform}`,
      404,
    );
  }

  if (!response.ok) {
    logger.error(
      { statusCode: response.status, platform },
      "The ML service returned an unsuccessful response",
    );
    throw new AppError(
      response.status >= 500 ? "ML_SERVICE_UNAVAILABLE" : "ML_SERVICE_ERROR",
      response.status >= 500
        ? "The ML service is unavailable"
        : "The ML service returned an unexpected response",
      response.status >= 500 ? 503 : 502,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.error({ err: error, platform }, "The ML service returned invalid JSON");
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned an invalid response",
      502,
    );
  }

  const metadata = modelMetadataSchema.safeParse(body);
  if (!metadata.success) {
    logger.error(
      { err: metadata.error, platform },
      "The ML service returned invalid model metadata",
    );
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned invalid model metadata",
      502,
    );
  }

  return metadata.data;
}
export async function listModelVersions(
  logger: FastifyBaseLogger,
): Promise<ModelMetadata[]> {
  const baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000";
  const url = new URL("/models", baseUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(ML_SERVICE_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error }, "Could not reach the ML service");
    throw new AppError(
      "ML_SERVICE_UNAVAILABLE",
      "The ML service is unavailable",
      503,
    );
  }

  if (!response.ok) {
    logger.error(
      { statusCode: response.status },
      "The ML service returned an unsuccessful response",
    );
    throw new AppError(
      response.status >= 500 ? "ML_SERVICE_UNAVAILABLE" : "ML_SERVICE_ERROR",
      response.status >= 500
        ? "The ML service is unavailable"
        : "The ML service returned an unexpected response",
      response.status >= 500 ? 503 : 502,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.error({ err: error }, "The ML service returned invalid JSON");
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned an invalid response",
      502,
    );
  }

  const metadata = z.array(modelMetadataSchema).safeParse(body);
  if (!metadata.success) {
    logger.error(
      { err: metadata.error },
      "The ML service returned invalid model metadata",
    );
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned invalid model metadata",
      502,
    );
  }

  return metadata.data;
}
async function setModelVersionStatus(
  version: string,
  status: "staged" | "production",
  logger: FastifyBaseLogger,
): Promise<ModelMetadata> {
  const baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000";
  const url = new URL(
    `/models/${encodeURIComponent(version)}/status`,
    baseUrl,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(ML_SERVICE_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error, version }, "Could not reach the ML service");
    throw new AppError(
      "ML_SERVICE_UNAVAILABLE",
      "The ML service is unavailable",
      503,
    );
  }

  if (response.status === 404) {
    throw new AppError("MODEL_NOT_FOUND", `Model ${version} does not exist`, 404);
  }

  if (response.status === 409) {
    throw new AppError(
      "MODEL_TRANSITION_REJECTED",
      `Model ${version} cannot be moved to ${status}`,
      409,
    );
  }

  if (!response.ok) {
    logger.error(
      { statusCode: response.status, version },
      "The ML service returned an unsuccessful response",
    );
    throw new AppError(
      response.status >= 500 ? "ML_SERVICE_UNAVAILABLE" : "ML_SERVICE_ERROR",
      response.status >= 500
        ? "The ML service is unavailable"
        : "The ML service returned an unexpected response",
      response.status >= 500 ? 503 : 502,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.error({ err: error, version }, "The ML service returned invalid JSON");
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned an invalid response",
      502,
    );
  }

  const metadata = modelMetadataSchema.safeParse(body);
  if (!metadata.success) {
    logger.error(
      { err: metadata.error, version },
      "The ML service returned invalid model metadata",
    );
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned invalid model metadata",
      502,
    );
  }

  return metadata.data;
}

export function promoteModelVersion(
  version: string,
  logger: FastifyBaseLogger,
): Promise<ModelMetadata> {
  return setModelVersionStatus(version, "production", logger);
}

export function stageModelVersion(
  version: string,
  logger: FastifyBaseLogger,
): Promise<ModelMetadata> {
  return setModelVersionStatus(version, "staged", logger);
}

const ML_DOWNLOAD_TIMEOUT_MS = 30_000;

export async function downloadModel(
  version: string,
  logger: FastifyBaseLogger,
): Promise<Buffer> {
  const baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000";
  const url = new URL(`/models/${version}/download`, baseUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(ML_DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error, version }, "Could not reach the ML service");
    throw new AppError(
      "ML_SERVICE_UNAVAILABLE",
      "The ML service is unavailable",
      503,
    );
  }

  if (response.status === 404) {
    throw new AppError("MODEL_NOT_FOUND", `Model ${version} does not exist`, 404);
  }
  if (!response.ok) {
    logger.error({ statusCode: response.status, version }, "ML download failed");
    throw new AppError(
      response.status >= 500 ? "ML_SERVICE_UNAVAILABLE" : "ML_SERVICE_ERROR",
      "The ML service could not provide the model file",
      response.status >= 500 ? 503 : 502,
    );
  }

  // Model files are a few MB, so holding one in memory is fine.
  return Buffer.from(await response.arrayBuffer());
}

export async function uploadModelVersion(
  input: ModelUploadMetadata & { file: Buffer; filename: string },
  logger: FastifyBaseLogger,
): Promise<ModelMetadata> {
  const baseUrl = process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000";
  const url = new URL("/models", baseUrl);
  const form = new FormData();

  form.set("version", input.version);
  for (const platform of input.platforms) {
    form.append("platforms", platform);
  }
  form.set("quantization", input.quantization);
  form.set("accuracy", String(input.accuracy));
  form.set("notes", input.notes);
  form.set(
    "file",
    new Blob([new Uint8Array(input.file)], {
      type: "application/octet-stream",
    }),
    input.filename,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logger.error({ err: error, version: input.version }, "Could not reach the ML service");
    throw new AppError(
      "ML_SERVICE_UNAVAILABLE",
      "The ML service is unavailable",
      503,
    );
  }

  if (response.status === 409) {
    throw new AppError("MODEL_VERSION_EXISTS", "This model version already exists", 409);
  }

  if (response.status === 422) {
    throw new AppError("INVALID_MODEL_UPLOAD", "The ML service rejected the model upload", 400);
  }

  if (!response.ok) {
    logger.error(
      { statusCode: response.status, version: input.version },
      "The ML service returned an unsuccessful upload response",
    );
    throw new AppError(
      response.status >= 500 ? "ML_SERVICE_UNAVAILABLE" : "ML_SERVICE_ERROR",
      response.status >= 500
        ? "The ML service is unavailable"
        : "The ML service returned an unexpected response",
      response.status >= 500 ? 503 : 502,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.error({ err: error, version: input.version }, "The ML service returned invalid JSON");
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned an invalid response",
      502,
    );
  }

  const metadata = modelMetadataSchema.safeParse(body);
  if (!metadata.success) {
    logger.error(
      { err: metadata.error, version: input.version },
      "The ML service returned invalid model metadata",
    );
    throw new AppError(
      "ML_SERVICE_INVALID_RESPONSE",
      "The ML service returned invalid model metadata",
      502,
    );
  }

  return metadata.data;
}