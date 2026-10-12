import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { API_URL } from "./config";
import { tokenStorage, type AuthTokens } from "./tokenStorage";

// Lets us mark a request that was already retried once, so a second 401
// does not start another refresh.
declare module "axios" {
  interface AxiosRequestConfig {
    _retried?: boolean;
  }
}

// A 401 on these means bad credentials, not an expired access token.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

// Only a server rejection means the session is over. A network error
// keeps the tokens so the user stays signed in.
const REJECTED_STATUSES = [400, 401, 403];

class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
  }
}

let onSessionExpired: (() => void) | null = null;

/** Called once the session is unrecoverable (refresh rejected). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/** The client every API call goes through: adds the token, refreshes on 401. */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

// Used only for /auth/refresh. It has no interceptors, so a failing refresh
// can never trigger another refresh.
const bareClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
});

// The first 401 starts a refresh; the others wait for the same promise.
// Refresh tokens are single-use, so two refreshes at once would make the
// server reject the second and end the session.
let refreshing: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (refreshToken === null) throw new SessionExpiredError();

  try {
    const response = await bareClient.post<AuthTokens>("/auth/refresh", { refreshToken });
    tokenStorage.save(response.data);
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response !== undefined &&
      REJECTED_STATUSES.includes(error.response.status)
    ) {
      throw new SessionExpiredError();
    }
    throw error;
  }
}

async function refreshIfStale(failed: InternalAxiosRequestConfig): Promise<void> {
  const current = tokenStorage.getAccessToken();
  const usedCurrent = failed.headers.get("Authorization") === `Bearer ${current}`;
  // Another request already refreshed while this one was in flight.
  if (current !== null && !usedCurrent) return;

  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  await refreshing;
}

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token !== null) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.config === undefined) throw error;

  const request = error.config;
  const canRefresh =
    error.response?.status === 401 &&
    !NO_REFRESH_PATHS.includes(request.url ?? "") &&
    request._retried !== true;
  if (!canRefresh) throw error;

  try {
    await refreshIfStale(request);
  } catch (refreshError) {
    if (refreshError instanceof SessionExpiredError) {
      tokenStorage.clear();
      onSessionExpired?.();
      throw error;
    }
    // Offline or server down: keep the tokens, the user is still signed in.
    throw refreshError;
  }

  // Retry once. The flag stops a second 401 from refreshing again.
  request._retried = true;
  return apiClient(request);
});

/** Pulls `error.message` out of the API's `{ error: { code, message } }` body. */
function extractMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const inner = body.error;
  if (typeof inner !== "object" || inner === null || !("message" in inner)) return null;
  return typeof inner.message === "string" ? inner.message : null;
}

/** Turns any thrown error into a message the user can read. */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response === undefined) return "Cannot reach the server. Check your connection.";
    if (error.response.status === 429) return "Too many attempts. Wait a minute and try again.";
    return extractMessage(error.response.data) ?? "The request failed.";
  }
  return "Something went wrong.";
}
