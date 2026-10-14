import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./features/auth/AuthContext";
import { useAuth } from "./features/auth/auth-context";
import ProtectedRoute from "./features/auth/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import InspectionsPage from "./pages/InspectionsPage";
import AppLayout from "./components/AppLayout";
import InspectionDetailPage from "./pages/InspectionDetailPage";
import DashboardPage from "./pages/DashboardPage";

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


function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<ProtectedRoute requiredRole="ADMIN" />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inspections" element={<InspectionsPage />} />
          <Route path="/inspections/:id" element={<InspectionDetailPage />} />
        </Route>
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
