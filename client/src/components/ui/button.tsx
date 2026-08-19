import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-strong",
        outline: "border border-soft bg-surface text-ink hover:bg-primary-soft",
        ghost: "text-ink hover:bg-primary-soft",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  children: ReactNode;
}

export const Button = ({
  className,
  variant,
  size,
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => (
  <button
    className={cn(buttonVariants({ variant, size }), className)}
    disabled={disabled || isLoading}
    {...props}
  >
    {isLoading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
    {children}
  </button>
);
