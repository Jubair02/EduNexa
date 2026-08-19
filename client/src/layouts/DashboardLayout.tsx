import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNavbar } from "@/components/layout/TopNavbar";
import { cn } from "@/utils/cn";

const COLLAPSE_KEY = "lms_sidebar_collapsed";

/**
 * Shell for every signed-in screen: sticky top navbar, collapsible sidebar
 * (a slide-out drawer under `lg`), and a main column that reserves exactly the
 * sidebar's width so the two never overlap.
 */
export const DashboardLayout = () => {
  const location = useLocation();
  const mobileNavButtonRef = useRef<HTMLButtonElement | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "true"
  );
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }, []);

  const closeMobileNav = useCallback(() => {
    setIsMobileOpen(false);
    mobileNavButtonRef.current?.focus();
  }, []);

  // Navigating from the drawer should dismiss it — without pulling focus back
  // to the trigger, since the user is now reading the new page.
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-paper">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-2 focus:outline-primary"
      >
        Skip to main content
      </a>

      <TopNavbar
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        onOpenMobileNav={() => setIsMobileOpen(true)}
        mobileNavButtonRef={mobileNavButtonRef}
      />

      <Sidebar
        isCollapsed={isCollapsed}
        isMobileOpen={isMobileOpen}
        onCloseMobile={closeMobileNav}
      />

      <div
        className={cn(
          "transition-[padding] duration-300 ease-out",
          isCollapsed ? "lg:pl-[76px]" : "lg:pl-[260px]"
        )}
      >
        <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
