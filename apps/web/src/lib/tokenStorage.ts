export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_KEY = "fieldlens.refreshToken";

// The access token only lives in memory: a page reload clears it, and the
// refresh token is used to get a new one.
let accessToken: string | null = null;

/** Reads and writes the token pair. Only the refresh token is persisted. */
export const tokenStorage = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      // Storage can be blocked (private mode); act as if nothing is saved.
      return null;
    }
  },

  save(tokens: AuthTokens): void {
    accessToken = tokens.accessToken;
    try {
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      // Not saved: the user will have to sign in again after a reload.
    }
  },

  clear(): void {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      // Nothing to remove.
    }
  },
};
