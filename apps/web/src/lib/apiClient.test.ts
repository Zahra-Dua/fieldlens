import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// What our fake server answers. "network-error" means no answer at all.
type Reply = { status: number; data?: unknown } | "network-error";

let server: (config: InternalAxiosRequestConfig) => Promise<Reply> | Reply;
let calls: string[] = [];

// Replaces the real network. Both axios clients in apiClient.ts use it.
async function fakeAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  calls.push(`${(config.method ?? "get").toUpperCase()} ${config.url ?? ""}`);
  const reply = await server(config);

  if (reply === "network-error") {
    throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
  }

  const response: AxiosResponse = {
    data: reply.data ?? null,
    status: reply.status,
    statusText: "",
    headers: {},
    config,
  };
  if (reply.status >= 200 && reply.status < 300) return response;

  throw new AxiosError(
    `Request failed with status code ${reply.status}`,
    AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  );
}

const NEW_TOKENS = { accessToken: "new-access", refreshToken: "new-refresh" };

// A normal server: /items works only with the new access token,
// and /auth/refresh hands out the new tokens.
function normalServer(config: InternalAxiosRequestConfig): Reply {
  if (config.url === "/auth/refresh") return { status: 200, data: NEW_TOKENS };
  if (config.headers.get("Authorization") === "Bearer new-access") {
    return { status: 200, data: { ok: true } };
  }
  return { status: 401 };
}

function count(call: string): number {
  return calls.filter((entry) => entry === call).length;
}

let api: typeof import("./apiClient");
let storage: typeof import("./tokenStorage");

beforeAll(async () => {
  // Set before apiClient.ts is loaded: axios.create() copies these defaults.
  axios.defaults.adapter = fakeAdapter;
  api = await import("./apiClient");
  storage = await import("./tokenStorage");
});

beforeEach(() => {
  calls = [];
  server = normalServer;
  localStorage.clear();
  storage.tokenStorage.save({ accessToken: "old-access", refreshToken: "old-refresh" });
  api.setSessionExpiredHandler(null);
});

describe("apiClient token refresh", () => {
  it("refreshes after a 401 and retries the request", async () => {
    const response = await api.apiClient.get("/items");

    expect(response.data).toEqual({ ok: true });
    expect(count("POST /auth/refresh")).toBe(1);
    expect(count("GET /items")).toBe(2);
    expect(storage.tokenStorage.getRefreshToken()).toBe("new-refresh");
  });

  it("runs only one refresh when several requests get 401 together", async () => {
    // A slow refresh, so all three requests are waiting at the same time.
    server = async (config) => {
      if (config.url === "/auth/refresh") {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return normalServer(config);
    };

    const results = await Promise.all([
      api.apiClient.get("/items"),
      api.apiClient.get("/items"),
      api.apiClient.get("/items"),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    expect(count("POST /auth/refresh")).toBe(1);
  });

  it("retries only once when the server keeps answering 401", async () => {
    server = (config) =>
      config.url === "/auth/refresh" ? { status: 200, data: NEW_TOKENS } : { status: 401 };

    await expect(api.apiClient.get("/items")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(count("POST /auth/refresh")).toBe(1);
    expect(count("GET /items")).toBe(2);
  });

  it("does not refresh when the login itself returns 401", async () => {
    server = () => ({ status: 401 });

    await expect(api.apiClient.post("/auth/login", {})).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(count("POST /auth/refresh")).toBe(0);
  });

  it("clears the tokens and tells the app when the refresh is rejected", async () => {
    const onExpired = vi.fn();
    api.setSessionExpiredHandler(onExpired);
    server = () => ({ status: 401 });

    await expect(api.apiClient.get("/items")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(storage.tokenStorage.getRefreshToken()).toBeNull();
    expect(storage.tokenStorage.getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("keeps the tokens when the refresh fails because of the network", async () => {
    const onExpired = vi.fn();
    api.setSessionExpiredHandler(onExpired);
    server = (config) => (config.url === "/auth/refresh" ? "network-error" : { status: 401 });

    await expect(api.apiClient.get("/items")).rejects.toBeInstanceOf(AxiosError);
    expect(storage.tokenStorage.getRefreshToken()).toBe("old-refresh");
    expect(onExpired).not.toHaveBeenCalled();
  });
});
