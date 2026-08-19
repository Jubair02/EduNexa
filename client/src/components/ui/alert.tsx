import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

const alertVariants = cva("flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm", {
  variants: {
    variant: {
      error: "border-danger/30 bg-danger-soft text-danger",
      success: "border-success/30 bg-success-soft text-success",
    },
  },
  defaultVariants: {
    variant: "error",
  },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = ({ className, variant, children, ...props }: AlertProps) => {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
};
