import { createContext, useContext } from "react";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  isRestoring: boolean;
  isLoggingIn: boolean;
  loginError: unknown;
  restoreError: unknown;
  login: (credentials: LoginCredentials) => void;
  isLoggingOut: boolean;
  logoutError: unknown;
  logout: () => void;
  currentUser: CurrentUser | undefined;
  isLoadingCurrentUser: boolean;
  currentUserError: unknown;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}
