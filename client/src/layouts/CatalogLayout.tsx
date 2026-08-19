import { FullPageSpinner } from "@/components/ui/spinner";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { PublicLayout } from "@/layouts/PublicLayout";
import { useAuth } from "@/hooks/useAuth";

/**
 * The course catalog is public, but signed-in people reach it from the sidebar
 * ("Browse Courses"). Rendering the dashboard shell for them keeps navigation
 * in place instead of dropping them into a different chrome mid-session.
 */
export const CatalogLayout = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;
  return user ? <DashboardLayout /> : <PublicLayout />;
};
