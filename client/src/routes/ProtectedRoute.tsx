import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";
import { dashboardPathFor } from "@/utils/roleRoutes";

interface ProtectedRouteProps {
  /** When set, only these roles may enter; others go to their own dashboard. */
  allowedRoles?: UserRole[];
}

export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner label="Checking your session…" />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={dashboardPathFor(user.role)} replace />;
  }

  return <Outlet />;
};
