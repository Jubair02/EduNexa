import {
  Bell,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserMenu } from "@/components/layout/UserMenu";
import { cn } from "@/utils/cn";

interface TopNavbarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileNav: () => void;
  /** Held by the layout so focus can return here when the drawer closes. */
  mobileNavButtonRef: RefObject<HTMLButtonElement | null>;
}

/** Icon button that opens a small panel — notifications and messages. */
const IconPanel = ({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "flex size-10 items-center justify-center rounded-xl text-muted transition-colors duration-200",
          "hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open && "bg-paper text-ink"
        )}
      >
        {icon}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-soft bg-surface p-4 shadow-lg"
        >
          <p className="text-sm font-semibold">{label}</p>
          {children}
        </div>
      )}
    </div>
  );
};

export const TopNavbar = ({
  isCollapsed,
  onToggleCollapse,
  onOpenMobileNav,
  mobileNavButtonRef,
}: TopNavbarProps) => {
  const navigate = useNavigate();
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

          <IconPanel label="Notifications" icon={<Bell className="size-5" aria-hidden="true" />}>
            <p className="mt-1 text-sm text-muted">
              You're all caught up. Course and enrollment alerts arrive with the
              notifications phase.
            </p>
          </IconPanel>

          <IconPanel
            label="Messages"
            icon={<MessageSquare className="size-5" aria-hidden="true" />}
          >
            <p className="mt-1 text-sm text-muted">
              No messages yet. Direct messaging between students and instructors is
              planned for a later phase.
            </p>
          </IconPanel>

          <div className="mx-1 hidden h-8 w-px bg-soft sm:block" aria-hidden="true" />

          <UserMenu className="hidden sm:block sm:w-auto sm:min-w-[11rem]" />
          <UserMenu compact className="sm:hidden" />
        </div>
      </div>
    </header>
  );
};
