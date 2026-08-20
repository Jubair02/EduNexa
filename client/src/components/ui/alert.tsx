import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

const alertVariants = cva("flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm", {
  variants: {
    variant: {
      error: "border-danger/30 bg-danger-soft text-danger",
      success: "border-success/30 bg-success-soft text-success",
      // Reuses the existing amber accent — not an error, but needs attention.
      warning: "border-amber/40 bg-amber/10 text-amber-strong",
    },
  },
  defaultVariants: {
    variant: "error",
  },
});

const ICONS = {
  error: AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
} as const;

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = ({ className, variant, children, ...props }: AlertProps) => {
  const Icon = ICONS[variant ?? "error"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
};
