import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { NAV_BY_ROLE, type NavItem } from "@/components/layout/navConfig";
import { UserMenu } from "@/components/layout/UserMenu";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import type { UserRole } from "@/types";
import { cn } from "@/utils/cn";

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

const rowClass = (collapsed: boolean, isActive: boolean): string =>
  cn(
    "relative flex h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-200",
    collapsed ? "w-11 justify-center px-0" : "px-3",
    isActive
      ? "bg-primary-soft text-primary-strong"
      : "text-muted hover:bg-paper hover:text-ink"
  );

/** One navigation row — a link, or a disabled row for a later-phase feature. */
const NavRow = ({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
}) => {
  const { label, icon: Icon, to } = item;

  if (!to) {
    return (
      <Tooltip label={`${label} — coming soon`} enabled={collapsed}>
        <div
          aria-disabled="true"
          title={collapsed ? `${label} — coming soon` : undefined}
          className={cn(rowClass(collapsed, false), "cursor-not-allowed opacity-55")}
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{label}</span>
              <span className="rounded-full bg-soft px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase">
                Soon
              </span>
            </>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={label} enabled={collapsed}>
      <NavLink
        to={to}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            rowClass(collapsed, isActive),
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Active accent rail — reads instantly when scanning the column. */}
            {isActive && !collapsed && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 h-5 w-1 -translate-x-1 -translate-y-1/2 rounded-r-full bg-primary"
              />
            )}
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </Tooltip>
  );
};

const NavList = ({
  role,
  collapsed,
  onNavigate,
}: {
  role: UserRole;
  collapsed: boolean;
  onNavigate: () => void;
}) => {
  const { primary, secondary } = NAV_BY_ROLE[role];

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3",
        collapsed ? "items-center px-3" : "px-3"
      )}
    >
      {primary.map((item) => (
        <NavRow key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      <hr className={cn("my-2 border-soft", collapsed ? "w-8" : "w-full")} />

      {secondary.map((item) => (
        <NavRow key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
};

export const Sidebar = ({ isCollapsed, isMobileOpen, onCloseMobile }: SidebarProps) => {
  const { user } = useAuth();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Drawer: trap page scroll and close on Escape while it's open.
  useEffect(() => {
    if (!isMobileOpen) return;

    drawerRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileOpen, onCloseMobile]);

  if (!user) return null;

  const footer = (collapsed: boolean) => (
    <div className={cn("border-t border-soft p-3", collapsed && "flex justify-center")}>
      {collapsed ? (
        <UserMenu compact side="top" />
      ) : (
        <UserMenu side="top" showRole />
      )}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          "fixed top-16 bottom-0 left-0 z-30 hidden flex-col border-r border-soft bg-surface transition-[width] duration-300 ease-out lg:flex",
          isCollapsed ? "w-[76px]" : "w-[260px]"
        )}
      >
        <NavList role={user.role} collapsed={isCollapsed} onNavigate={() => {}} />
        {footer(isCollapsed)}
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 cursor-default bg-ink/50"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-2xl outline-none"
          >
            {/* Mirrors the navbar it stands in for; the account block lives in
                the footer, exactly as on desktop. */}
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-soft px-4">
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-aubergine"
                >
                  <span className="size-4 rounded-[50%_50%_50%_0] bg-amber" />
                </span>
                <span className="truncate font-display text-lg font-semibold tracking-tight">
                  Edu<span className="text-primary">Nexa</span>
                </span>
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <NavList role={user.role} collapsed={false} onNavigate={onCloseMobile} />
            {footer(false)}
          </div>
        </div>
      )}
    </>
  );
};
