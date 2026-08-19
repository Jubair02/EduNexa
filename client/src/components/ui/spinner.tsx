import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2
    className={cn("size-6 animate-spin text-primary", className)}
    aria-hidden="true"
  />
);

export const FullPageSpinner = ({ label = "Loading…" }: { label?: string }) => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper"
    role="status"
    aria-live="polite"
  >
    <Spinner className="size-8" />
    <p className="text-sm text-muted">{label}</p>
  </div>
);
