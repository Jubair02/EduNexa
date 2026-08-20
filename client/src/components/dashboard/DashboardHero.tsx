import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const today = (): string =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Shared dashboard header. The wording and the primary actions differ by role,
 * so both are supplied by the page — an instructor must never be offered
 * "Manage users", which their role cannot do.
 */
export const DashboardHero = ({
  firstName,
  eyebrow,
  subtitle,
  actions,
  updatedAt,
  isRefreshing,
  onRefresh,
}: {
  firstName: string;
  /** Small caps label above the greeting, e.g. "Admin overview". */
  eyebrow: string;
  subtitle: string;
  /** Role-appropriate primary actions. */
  actions?: ReactNode;
  /** Already formatted for display, e.g. "14:40". */
  updatedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) => (
  <section className="relative overflow-hidden rounded-2xl bg-aubergine px-5 py-6 text-white sm:px-8 sm:py-8">
    {/* Brand glow — diffuse so headline and buttons keep their contrast. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/30 blur-3xl"
    />
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-10 -bottom-28 size-56 rounded-full bg-amber/10 blur-3xl"
    />

    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold tracking-wide text-white/60 uppercase">
          <span>{eyebrow}</span>
          <span aria-hidden="true">•</span>
          <span className="normal-case">{today()}</span>
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">{subtitle}</p>
      </div>

      <div className="flex flex-col gap-3 sm:items-end">
        {/* Comfortable 44px targets on touch, tighter on desktop. */}
        {actions && (
          <div className="flex w-full items-center gap-2 sm:w-auto">{actions}</div>
        )}

        <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 px-2 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-100"
          >
            <RefreshCw
              className={cn("size-4", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <p className="text-xs text-white/60" aria-live="polite">
            {isRefreshing ? "Updating…" : updatedAt ? `Updated ${updatedAt}` : ""}
          </p>
        </div>
      </div>
    </div>
  </section>
);
