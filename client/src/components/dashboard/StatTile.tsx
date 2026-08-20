import { ArrowUpRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

export type StatAccent = "primary" | "success" | "amber" | "aubergine";

const accents: Record<StatAccent, { chip: string; bar: string }> = {
  primary: { chip: "bg-primary-soft text-primary", bar: "bg-primary" },
  success: { chip: "bg-success-soft text-success", bar: "bg-success" },
  amber: { chip: "bg-amber/15 text-amber-strong", bar: "bg-amber" },
  aubergine: { chip: "bg-aubergine/10 text-aubergine-strong", bar: "bg-aubergine" },
};

export interface StatTileProps {
  label: string;
  value: string;
  /** Small line under the meter — the "why" behind the number. */
  caption?: string;
  /** 0–100. Draws a thin meter so the number gains context at a glance. */
  share?: number;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent?: StatAccent;
  /** When set, the whole tile becomes a link to the matching screen. */
  to?: string;
}

export const StatTile = ({
  label,
  value,
  caption,
  share,
  icon: Icon,
  accent = "primary",
  to,
}: StatTileProps) => {
  const { chip, bar } = accents[accent];
  const meter = share === undefined ? undefined : Math.max(0, Math.min(100, share));

  const tile = (
    <Card
      className={cn(
        "group relative h-full overflow-hidden transition duration-200",
        to && "group-hover:border-primary/30 group-focus-visible:border-primary/30"
      )}
    >
      {/* Soft brand glow — warms the card without competing with the number. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-8 size-32 rounded-full bg-primary/10 blur-2xl transition-transform duration-300 group-hover:scale-125"
      />

      <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <span className={cn("shrink-0 rounded-xl p-2.5", chip)}>
          <Icon className="size-5" aria-hidden={true} />
        </span>
      </div>

      <div className="relative px-5 pt-4 pb-5">
        {meter !== undefined && (
          <div className="h-1.5 overflow-hidden rounded-full bg-soft">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", bar)}
              style={{ width: `${meter}%` }}
            />
          </div>
        )}
        {caption && (
          <p className={cn("text-xs text-muted", meter !== undefined && "mt-2")}>
            {caption}
          </p>
        )}
      </div>

      {to && (
        <ArrowUpRight
          className="absolute right-4 bottom-4 size-4 text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      )}
    </Card>
  );

  if (!to) return tile;

  return (
    <Link
      to={to}
      className="group block rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {tile}
    </Link>
  );
};

export const StatTileSkeleton = (): ReactNode => (
  <Card className="h-full px-5 py-5">
    <div className="flex items-start justify-between gap-3">
      <div className="w-full">
        <div className="h-3 w-24 animate-pulse rounded bg-soft" />
        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-soft" />
      </div>
      <div className="size-10 animate-pulse rounded-xl bg-soft" />
    </div>
    <div className="mt-6 h-1.5 w-full animate-pulse rounded-full bg-soft" />
    <div className="mt-2 h-3 w-28 animate-pulse rounded bg-soft" />
  </Card>
);
