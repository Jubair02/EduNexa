import {
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
} from "lucide-react";
import { useState, type FormEvent, type RefObject } from "react";
import { Link, useNavigate } from "react-router-dom";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useTheme } from "@/hooks/useTheme";

interface TopNavbarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileNav: () => void;
  /** Held by the layout so focus can return here when the drawer closes. */
  mobileNavButtonRef: RefObject<HTMLButtonElement | null>;
}

/**
 * The account menu is deliberately absent here: the sidebar footer carries it
 * at every breakpoint — the rail above `lg`, the drawer footer below — so a
 * second copy in the navbar was the same control twice on one screen.
 */
export const TopNavbar = ({
  isCollapsed,
  onToggleCollapse,
  onOpenMobileNav,
  mobileNavButtonRef,
}: TopNavbarProps) => {
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();
  const [query, setQuery] = useState("");

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    navigate(term ? `/courses?search=${encodeURIComponent(term)}` : "/courses");
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-soft bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-full items-center gap-3 px-3 sm:gap-4 sm:px-5">
        {/* Drawer trigger (mobile) and collapse toggle (desktop) */}
        <button
          ref={mobileNavButtonRef}
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={isCollapsed}
          className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:flex"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-5" aria-hidden="true" />
          )}
        </button>

        {/* Brand */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-xl bg-aubergine"
          >
            {/* Petal mark — the same motif as the sign-in panel. */}
            <span className="size-4 rounded-[50%_50%_50%_0] bg-amber" />
          </span>
          {/* Under 400px the mark carries the brand alone — the wordmark plus
              the action cluster would not fit a 320–390px row. */}
          <span className="hidden font-display text-lg font-semibold tracking-tight whitespace-nowrap min-[400px]:inline">
            Edu<span className="text-primary">Nexa</span>
          </span>
        </Link>

        {/* Course search — the catalog owns its own field on small screens. */}
        <form
          onSubmit={handleSearch}
          role="search"
          className="mx-auto hidden w-full max-w-md md:block"
        >
          <label htmlFor="navbar-search" className="sr-only">
            Search courses
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="navbar-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses…"
              className="h-10 w-full rounded-xl border border-soft bg-paper pr-3 pl-9 text-sm text-ink placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-2 focus:outline-offset-1 focus:outline-primary/25"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-1.5">
          <Link
            to="/courses"
            aria-label="Search courses"
            className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>

          <NotificationBell />

          <button
            type="button"
            onClick={toggle}
            aria-label={
              resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            title={resolved === "dark" ? "Light theme" : "Dark theme"}
            className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {resolved === "dark" ? (
              <Sun className="size-5" aria-hidden="true" />
            ) : (
              <Moon className="size-5" aria-hidden="true" />
            )}
          </button>

        </div>
      </div>
    </header>
  );
};
