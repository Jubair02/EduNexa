import type { InputHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = ({ className, type = "text", ...props }: InputProps) => (
  <input
    type={type}
    className={cn(
      "h-11 w-full rounded-lg border border-soft bg-surface px-3.5 text-sm text-ink placeholder:text-muted",
      "focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25",
      "aria-invalid:border-danger aria-invalid:focus:outline-danger/25",
      "disabled:cursor-not-allowed disabled:opacity-60",
      className
    )}
    {...props}
  />
);
