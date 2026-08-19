import { BookOpen } from "lucide-react";
import type { Course } from "@/types";
import { cn } from "@/utils/cn";

/** Course image with a branded placeholder when no thumbnail is set. */
export const CourseThumbnail = ({
  course,
  className,
}: {
  course: Pick<Course, "title" | "thumbnail">;
  className?: string;
}) => {
  if (course.thumbnail?.url) {
    return (
      <img
        src={course.thumbnail.url}
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
