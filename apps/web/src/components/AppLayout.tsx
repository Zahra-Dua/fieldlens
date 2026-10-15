import { NavLink, Outlet } from "react-router";
import { useAuth } from "../features/auth/auth-context";
import { useInspectionLiveUpdates } from "../features/inspections/useInspectionLiveUpdates";

export default function AppLayout() {
  const { currentUser, logout, isLoggingOut } = useAuth();
  const liveUpdateStatus = useInspectionLiveUpdates();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-slate-900">FieldLens</span>
            <nav aria-label="Main" className="flex gap-1">
              <NavLink to="/dashboard" className={linkClass}>
                Overview
              </NavLink>
              <NavLink to="/inspections" className={linkClass}>
                Inspections
              </NavLink>
              <NavLink to="/review-queue" className={linkClass}>
                Review Queue
              </NavLink>
              <NavLink to="/models" className={linkClass}>
                Models
              </NavLink>
              <NavLink to="/devices" className={linkClass}>
                Devices
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1.5 text-xs text-slate-600"
              role="status"
              aria-label={`Live updates ${liveUpdateStatus}`}
              title={`Live updates ${liveUpdateStatus}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  liveUpdateStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {liveUpdateStatus === "connected" ? "Live" : "Reconnecting"}
            </span>
            <span className="text-sm text-slate-600">{currentUser?.name ?? ""}</span>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => {
                logout();
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
