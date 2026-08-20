import { Clock, User } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CategoryBadge, CourseStatusBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import type { Course } from "@/types";
import { cn } from "@/utils/cn";
import { formatDuration, instructorName } from "@/utils/courseMeta";

interface CourseCardProps {
  course: Course;
  /** Where the title links to (catalog uses the slug, management uses the id). */
  to: string;
  /** Management views show the status; the public catalog hides it. */
  showStatus?: boolean;
  /** Role-dependent actions rendered in the card footer. */
  actions?: ReactNode;
  /** Extra classes on the card itself — the catalog uses it to stagger entry. */
  className?: string;
}

/** Reusable course card for the catalog and mobile management views. */
export const CourseCard = ({
  course,
  to,
  showStatus = false,
  actions,
  className,
}: CourseCardProps) => (
  <article
    className={cn(
      "group flex h-full flex-col overflow-hidden rounded-2xl border border-soft bg-surface",
      "shadow-[0_1px_2px_rgba(35,26,38,0.06)]",
      // The shadow is tinted with the ink hue rather than pure black, so it
      // reads as depth on warm paper instead of a grey smudge.
      "transition-[border-color,box-shadow] duration-200 hover:border-primary/30",
      "hover:shadow-[0_10px_24px_-12px_rgba(35,26,38,0.2)]",
      className
    )}
  >
    <Link
      to={to}
      className="block h-36 shrink-0 overflow-hidden"
      tabIndex={-1}
      aria-hidden="true"
    >
      <CourseThumbnail
        course={course}
        className="transition-transform duration-500 group-hover:scale-[1.04]"
      />
    </Link>

    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg leading-snug font-semibold text-pretty">
          <Link to={to} className="transition-colors hover:text-primary">
            {course.title}
          </Link>
        </h3>
        {showStatus && <CourseStatusBadge status={course.status} />}
      </div>

      {course.shortDescription && (
        <p className="line-clamp-2 text-sm text-muted">{course.shortDescription}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={course.category} />
        <LevelBadge level={course.level} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 text-sm text-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <User className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{instructorName(course.instructor)}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
          <Clock className="size-4" aria-hidden="true" />
          {formatDuration(course.duration)}
        </span>
      </div>

      {actions && <div className="border-t border-soft pt-3">{actions}</div>}
    </div>
  </article>
);
