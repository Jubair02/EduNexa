import { cn } from "@/utils/cn";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
} as const;

interface AvatarProps {
  firstName: string;
  lastName: string;
  size?: keyof typeof sizes;
  className?: string;
}

/** Initials avatar — no image uploads exist yet, so initials are the identity. */
export const Avatar = ({ firstName, lastName, size = "md", className }: AvatarProps) => {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-strong",
        sizes[size],
        className
      )}
    >
      {initials}
    </span>
  );
};
