import { cn } from "@/utils/cn";

export interface DonutSegment {
  label: string;
  value: number;
  /** Tailwind stroke class from the EduNexa palette, e.g. "stroke-primary". */
  stroke: string;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Units of arc removed between segments so neighbouring colours stay readable. */
const GAP = 2;

/**
 * Decorative ring: it is `aria-hidden` on purpose — the same numbers are always
 * rendered as text beside it, which is what screen readers and colour-blind
 * users rely on.
 */
export const DonutChart = ({
  segments,
  centerValue,
  centerLabel,
  className,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
  className?: string;
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const drawn = segments.filter((segment) => segment.value > 0);
  const gap = drawn.length > 1 ? GAP : 0;

  let offset = 0;

  return (
    <div className={cn("relative mx-auto size-36 shrink-0", className)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="12"
          className="stroke-soft"
        />
        {drawn.map((segment) => {
          const length = (segment.value / total) * CIRCUMFERENCE;
          const visible = Math.max(length - gap, 0.5);
          const dash = `${visible} ${CIRCUMFERENCE - visible}`;
          const dashOffset = -offset;
          offset += length;

          return (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              className={segment.stroke}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-semibold tabular-nums">
          {centerValue}
        </span>
        <span className="mt-0.5 text-[11px] font-medium tracking-wide text-muted uppercase">
          {centerLabel}
        </span>
      </div>
    </div>
  );
};
