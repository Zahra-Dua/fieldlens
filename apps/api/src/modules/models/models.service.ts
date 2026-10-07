import type { FastifyBaseLogger } from "fastify";
import { AppError } from "../../shared/errors/AppError";
import {
  modelMetadataSchema,
  type LatestModelQuery,
  type ModelMetadata,
} from "./models.schemas";

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
