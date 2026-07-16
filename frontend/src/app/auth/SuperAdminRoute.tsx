import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthContext";

export function SuperAdminRoute() {
  const auth = useAuth();

  if (!auth.user?.is_super_admin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
