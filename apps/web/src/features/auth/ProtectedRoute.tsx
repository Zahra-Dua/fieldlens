import { Navigate, Outlet } from "react-router";
import { getErrorMessage } from "../../lib/apiClient";
import { useAuth } from "./auth-context";

interface ProtectedRouteProps {
  /** If set, only users with this role can see the page. */
  requiredRole?: string;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
      {children}
    </main>
  );
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const {
    isAuthenticated,
    isRestoring,
    currentUser,
    isLoadingCurrentUser,
    currentUserError,
    logout,
  } = useAuth();

  if (isRestoring) {
    return (
      <Message>
        <p className="text-slate-600">Restoring session...</p>
      </Message>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // No role needed: the user only has to be signed in.
  if (requiredRole === undefined) {
    return <Outlet />;
  }

  // The role comes from /auth/me, so we wait for it before deciding.
  if (isLoadingCurrentUser) {
    return (
      <Message>
        <p className="text-slate-600">Checking your access...</p>
      </Message>
    );
  }

  if (currentUserError !== null || currentUser === undefined) {
    return (
      <Message>
        <p role="alert" className="text-sm text-red-700">
          {getErrorMessage(currentUserError)}
        </p>
      </Message>
    );
  }

  if (currentUser.role !== requiredRole) {
    return (
      <Message>
        <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
        <p className="text-slate-600">This dashboard is only for administrators.</p>
        <button
          type="button"
          onClick={() => {
            logout();
          }}
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white"
        >
          Sign out
        </button>
      </Message>
    );
  }

  return <Outlet />;
}
