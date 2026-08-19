import { cn } from "@/utils/cn";

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cn("animate-pulse rounded-lg bg-soft", className)}
    aria-hidden="true"
  />
);
