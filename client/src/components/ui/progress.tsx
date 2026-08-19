import { cn } from "@/utils/cn";

interface ProgressProps {
  /**
   * 0–100. Pass `null` when the value genuinely isn't known yet — lesson
   * completion is tracked from a later phase, and an empty bar would read as
   * "0% done" rather than "not measured".
   */
  value: number | null;
  label?: string;
  className?: string;
}

export const Progress = ({ value, label, className }: ProgressProps) => {
  if (value === null) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div
          className="h-1.5 w-full rounded-full border border-dashed border-soft bg-paper"
          aria-hidden="true"
        />
        <p className="text-xs text-muted">{label ?? "Progress tracking arrives soon"}</p>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Course progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-soft"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && <p className="text-xs text-muted">{label}</p>}
    </div>
  );
};
