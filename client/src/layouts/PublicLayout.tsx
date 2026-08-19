import { Link, NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";
import { dashboardPathFor } from "@/utils/roleRoutes";

/** Layout for public pages (course catalog) — works signed in or out. */
export const PublicLayout = () => {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-soft bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              to="/"
              className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-xl bg-aubergine"
              >
                <span className="size-4 rounded-[50%_50%_50%_0] bg-amber" />
              </span>
              <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap">
                Edu<span className="text-primary">Nexa</span>
              </span>
            </Link>
            <NavLink
              to="/courses"
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary-soft text-primary-strong" : "text-muted hover:text-ink"
                )
              }
            >
              Courses
            </NavLink>
          </div>

          {!isLoading && (
            <div className="flex items-center gap-2">
              {user ? (
                <Link to={dashboardPathFor(user.role)}>
                  <Button variant="outline" size="sm">
                    Go to dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" size="sm">
                      Sign in
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button size="sm">Create account</Button>
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
};
