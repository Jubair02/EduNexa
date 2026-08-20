import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";
import { roleLabels } from "@/utils/roleRoutes";

interface UserMenuProps {
  /** Panel opens downward in the navbar, upward from the sidebar footer. */
  side?: "bottom" | "top";
  /** Icon-only trigger — used on small screens and in the collapsed sidebar. */
  compact?: boolean;
  /** Sidebar footer names the role under the user; the navbar doesn't. */
  showRole?: boolean;
  className?: string;
}

/** Profile dropdown, shared by the top navbar and the sidebar footer. */
export const UserMenu = ({
  side = "bottom",
  compact = false,
  showRole = false,
  className,
}: UserMenuProps) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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

  if (!user) return null;

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl text-left transition-colors duration-200",
          "hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          compact ? "h-11 w-11 justify-center" : "h-11 px-2"
        )}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {user.firstName} {user.lastName}
              </span>
              {showRole && (
                <span className="block truncate text-xs text-muted">
                  Role: {roleLabels[user.role]}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted transition-transform duration-200",
                open && "rotate-180"
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute right-0 z-50 w-60 overflow-hidden rounded-xl border border-soft bg-surface shadow-lg",
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2 left-0 right-auto"
          )}
        >
          <div className="border-b border-soft px-3.5 py-3">
            <p className="truncate text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <span className="mt-2 inline-block rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-strong">
              {roleLabels[user.role]}
            </span>
          </div>

          <div className="p-1.5">
            {[
              { label: "Profile", icon: UserRound, to: "/profile" },
              { label: "Settings", icon: Settings, to: "/settings" },
            ].map(({ label, icon: Icon, to }) => (
              <Link
                key={label}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-primary-soft hover:text-ink"
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="flex-1">{label}</span>
              </Link>
            ))}
          </div>

          <div className="border-t border-soft p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
