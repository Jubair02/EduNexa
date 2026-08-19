import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-soft bg-surface shadow-[0_1px_2px_rgba(35,26,38,0.06)]",
      className
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 pt-6 pb-2", className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn("font-display text-2xl font-semibold text-ink", className)} {...props} />
);

export const CardDescription = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("mt-1 text-sm text-muted", className)} {...props} />
);

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 py-4", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-6 pt-2 pb-6", className)} {...props} />
);
