import { Navigate, Outlet } from "react-router";
import { useAuth } from "./auth-context";

export default function ProtectedRoute() {
  const { isAuthenticated, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-600">Restoring session...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
