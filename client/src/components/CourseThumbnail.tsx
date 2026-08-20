import { BookOpen } from "lucide-react";
import type { Course } from "@/types";
import { cn } from "@/utils/cn";
import { safeUrl } from "@/utils/safeUrl";

/** Course image with a branded placeholder when no thumbnail is set. */
export const CourseThumbnail = ({
  course,
  className,
}: {
  course: Pick<Course, "title" | "thumbnail">;
  className?: string;
}) => {
  // A stored thumbnail is only rendered when it is a safe http(s) URL.
  const url = safeUrl(course.thumbnail?.url);
  if (url) {
    return (
      <img
        src={url}
        alt={`${course.title} thumbnail`}
        className={cn("h-full w-full object-cover", className)}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-aubergine",
        className
      )}
      aria-hidden="true"
    >
      <BookOpen className="size-8 text-amber/80" />
    </div>
  );
};
