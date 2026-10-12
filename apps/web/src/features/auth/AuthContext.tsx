import { useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { apiClient, setSessionExpiredHandler } from "../../lib/apiClient";
import { tokenStorage, type AuthTokens } from "../../lib/tokenStorage";
import {
  AuthContext,
  type AuthContextValue,
  type CurrentUser,
  type LoginCredentials,
} from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
}

const SESSION_QUERY_KEY = ["auth", "session"] as const;
const CURRENT_USER_QUERY_KEY = ["auth", "me"] as const;

// The server says the refresh token is not valid any more.
const REJECTED_STATUSES = [400, 401, 403];

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery<boolean>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const refreshToken = tokenStorage.getRefreshToken();

      if (refreshToken === null) {
        return false;
      }

      try {
        const response = await apiClient.post<AuthTokens>("/auth/refresh", {
          refreshToken,
        });

        tokenStorage.save(response.data);
        return true;
      } catch (error) {
        // Token rejected: it is dead, so remove it and show the login page.
        if (
          axios.isAxiosError(error) &&
          error.response !== undefined &&
          REJECTED_STATUSES.includes(error.response.status)
        ) {
          tokenStorage.clear();
          return false;
        }
        // Network or server problem: keep the token and show the error.
        throw error;
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const currentUserQuery = useQuery<CurrentUser>({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async () => {
      const response = await apiClient.get<CurrentUser>("/auth/me");
      return response.data;
    },
    enabled: sessionQuery.data === true,
    staleTime: 60_000,
  });

  useEffect(() => {
    setSessionExpiredHandler(() => {
      tokenStorage.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, false);
      queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    });

    return () => {
      setSessionExpiredHandler(null);
    };
  }, [queryClient]);

  const loginMutation = useMutation<AuthTokens, unknown, LoginCredentials>({
    mutationFn: async (credentials) => {
      const response = await apiClient.post<AuthTokens>("/auth/login", credentials);
      return response.data;
    },
    onSuccess: (tokens) => {
      tokenStorage.save(tokens);
      queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      queryClient.setQueryData(SESSION_QUERY_KEY, true);
    },
  });

  const logoutMutation = useMutation<void, unknown, void>({
    mutationFn: async () => {
      const refreshToken = tokenStorage.getRefreshToken();

      if (refreshToken !== null) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    },
    onSettled: () => {
      tokenStorage.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, false);
      queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    },
  });

  const value: AuthContextValue = {
    isAuthenticated: sessionQuery.data === true,
    isRestoring: sessionQuery.isPending,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    restoreError: sessionQuery.error,
    login: loginMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    logoutError: logoutMutation.error,
    logout: logoutMutation.mutate,
    currentUser: currentUserQuery.data,
    isLoadingCurrentUser: currentUserQuery.isPending,
    currentUserError: currentUserQuery.error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
