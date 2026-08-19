import type { LabelHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export const Label = ({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("mb-1.5 block text-sm font-medium text-ink", className)}
    {...props}
  />
);
