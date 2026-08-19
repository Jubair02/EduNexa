import { cn } from "@/utils/cn";

export interface BreakdownItem {
  label: string;
  value: number;
  /** Tailwind background class from the EduNexa palette, e.g. "bg-primary". */
  color: string;
}

const share = (value: number, total: number): number =>
  total > 0 ? (value / total) * 100 : 0;

/** One track split into proportional segments — composition at a glance. */
export const ShareBar = ({
  items,
  className,
}: {
  items: BreakdownItem[];
  className?: string;
}) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-soft", className)}
      aria-hidden="true"
    >
      {total > 0 &&
        items
          .filter((item) => item.value > 0)
          .map((item) => (
            <div
              key={item.label}
              className={cn("h-full transition-[width] duration-700", item.color)}
              style={{ width: `${share(item.value, total)}%` }}
            />
          ))}
    </div>
  );
};

/**
 * Accessible companion to `ShareBar`: every segment repeated as label + count +
 * percentage, so nothing depends on colour alone. `showBars` adds a per-row
 * meter for panels used without a stacked bar.
 */
export const BreakdownList = ({
  items,
  total,
  showBars = false,
}: {
  items: BreakdownItem[];
  total: number;
  showBars?: boolean;
}) => (
  <ul className="space-y-3">
    {items.map((item) => {
      const exact = share(item.value, total);
      const rounded = Math.round(exact);
      // A real-but-tiny slice should never read as a flat 0%.
      const percent = rounded === 0 && item.value > 0 ? "<1%" : `${rounded}%`;
      return (
        <li key={item.label}>
          <div className="flex items-center gap-2.5 text-sm">
            <span
              className={cn("size-2.5 shrink-0 rounded-full", item.color)}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted">{item.label}</span>
            <span className="font-medium tabular-nums">{item.value.toLocaleString()}</span>
            <span className="w-10 text-right text-xs text-muted tabular-nums">{percent}</span>
          </div>
          {showBars && (
            <div className="mt-1.5 ml-5 h-1.5 overflow-hidden rounded-full bg-soft">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", item.color)}
                style={{ width: `${exact}%` }}
              />
            </div>
          )}
        </li>
      );
    })}
  </ul>
);
