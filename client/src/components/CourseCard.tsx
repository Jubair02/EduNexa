import { Clock, User } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CategoryBadge, CourseStatusBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import type { Course } from "@/types";
import { formatDuration, instructorName } from "@/utils/courseMeta";

interface CourseCardProps {
  course: Course;
  /** Where the title links to (catalog uses the slug, management uses the id). */
  to: string;
  /** Management views show the status; the public catalog hides it. */
  showStatus?: boolean;
  /** Role-dependent actions rendered in the card footer. */
  actions?: ReactNode;
}

/** Reusable course card for the catalog and mobile management views. */
export const CourseCard = ({ course, to, showStatus = false, actions }: CourseCardProps) => (
  <article className="flex flex-col overflow-hidden rounded-2xl border border-soft bg-surface shadow-[0_1px_2px_rgba(35,26,38,0.06)]">
    <Link to={to} className="block h-36 shrink-0" tabIndex={-1} aria-hidden="true">
      <CourseThumbnail course={course} />
    </Link>

    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg leading-snug font-semibold">
          <Link to={to} className="hover:text-primary">
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
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Clock className="size-4" aria-hidden="true" />
          {formatDuration(course.duration)}
        </span>
      </div>

      {actions && <div className="border-t border-soft pt-3">{actions}</div>}
    </div>
  </article>
);
