import { Plus, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const today = (): string =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export const DashboardHero = ({
  firstName,
  updatedAt,
  isRefreshing,
  onRefresh,
}: {
  firstName: string;
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
          <span>Admin overview</span>
          <span aria-hidden="true">•</span>
          <span className="normal-case">{today()}</span>
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">
          Here's what's happening on EduNexa.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:items-end">
        {/* Comfortable 44px targets on touch, tighter on desktop. */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link to="/admin/courses/new" className="flex-1 sm:flex-none">
            <Button size="sm" className="h-11 w-full whitespace-nowrap sm:h-9">
              <Plus className="size-4" aria-hidden="true" />
              New course
            </Button>
          </Link>
          <Link to="/admin/users" className="flex-1 sm:flex-none">
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-full border border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20 sm:h-9"
            >
              <Users className="size-4" aria-hidden="true" />
              Manage users
            </Button>
          </Link>
        </div>

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
