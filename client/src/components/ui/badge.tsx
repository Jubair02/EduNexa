import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-primary-soft text-primary-strong",
        amber: "bg-amber/15 text-amber-strong",
        aubergine: "bg-aubergine/10 text-aubergine-strong",
        success: "bg-success-soft text-success",
        // Destructive outcomes. Uses the palette's existing danger pair, the
        // same way `success` uses its own — an irreversible action must not read
        // like an ordinary edit.
        danger: "bg-danger-soft text-danger",
        muted: "bg-soft text-muted",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
