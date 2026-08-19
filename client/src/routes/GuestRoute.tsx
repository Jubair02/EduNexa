import { Navigate, Outlet } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { dashboardPathFor } from "@/utils/roleRoutes";

/** Routes for signed-out visitors only — signed-in users go to their dashboard. */
export const GuestRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner label="Checking your session…" />;
  }

  if (user) {
    return <Navigate to={dashboardPathFor(user.role)} replace />;
  }

  return <Outlet />;
};
