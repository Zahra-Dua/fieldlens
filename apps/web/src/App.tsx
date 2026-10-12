import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./features/auth/AuthContext";
import { useAuth } from "./features/auth/auth-context";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import { getErrorMessage } from "./lib/apiClient";
import LoginPage from "./pages/LoginPage";

function LoginRoute() {
  const { isAuthenticated, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Restoring session...</p>
      </main>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage />;
}

function DashboardPage() {
  const { logout, isLoggingOut, logoutError, currentUser, isLoadingCurrentUser, currentUserError } =
    useAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
      <h1 className="text-3xl font-semibold text-slate-800">Signed in to FieldLens</h1>

      {isLoadingCurrentUser && <p className="text-slate-600">Loading your profile...</p>}

      {currentUserError !== null && (
        <p role="alert" className="text-sm text-red-700">
          {getErrorMessage(currentUserError)}
        </p>
      )}

      {currentUser && (
        <section className="space-y-1 text-center text-slate-700">
          <p>{currentUser.name}</p>
          <p>{currentUser.email}</p>
          <p>Role: {currentUser.role}</p>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          logout();
        }}
        disabled={isLoggingOut}
        className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? "Signing out..." : "Sign out"}
      </button>

      {logoutError !== null && (
        <p role="alert" className="text-sm text-red-700">
          Server logout request failed. You have been signed out on this device.
        </p>
      )}
    </main>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
