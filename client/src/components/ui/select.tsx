import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = ({ className, children, ...props }: SelectProps) => (
  <div className={cn("relative", className)}>
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-lg border border-soft bg-surface pr-9 pl-3.5 text-sm text-ink",
        "focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25",
        "disabled:cursor-not-allowed disabled:opacity-60"
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      aria-hidden="true"
    />
  </div>
);
