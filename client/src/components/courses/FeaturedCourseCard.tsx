import { ArrowRight, Clock, User } from "lucide-react";
import { Link } from "react-router-dom";
import { CategoryBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import type { Course } from "@/types";
import { formatDuration, instructorName } from "@/utils/courseMeta";

interface FeaturedCourseCardProps {
  course: Course;
  to: string;
}

/**
 * The lead card of the catalog — one course given room to actually sell itself.
 *
 * Deliberately not a `CourseCard` with a `featured` flag: the two have different
 * proportions, a different type scale and a different amount of copy, so a
 * shared component would be a pile of conditionals. Everything genuinely common
 * (thumbnail, badges, meta formatting) is already extracted and reused here.
 */
export const FeaturedCourseCard = ({ course, to }: FeaturedCourseCardProps) => (
  <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-soft bg-surface shadow-[0_1px_2px_rgba(35,26,38,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-[0_12px_28px_-12px_rgba(35,26,38,0.22)]">
    {/*
     * Decorative: the heading below carries the real link, so this one is taken
     * out of the tab order rather than making every card cost two tab stops.
     * On wide screens it absorbs the leftover height of the two-row span.
     */}
    <Link
      to={to}
      className="block aspect-16/10 shrink-0 overflow-hidden sm:aspect-21/9 lg:aspect-auto lg:min-h-56 lg:flex-1"
      tabIndex={-1}
      aria-hidden="true"
    >
      <CourseThumbnail
        course={course}
        className="transition-transform duration-500 group-hover:scale-[1.03]"
      />
    </Link>

    <div className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* An eyebrow rather than a pill badge — "Featured" is a section label,
            not a status the course carries around with it. */}
        <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-primary uppercase">
          Featured
        </p>
        <CategoryBadge category={course.category} />
        <LevelBadge level={course.level} />
      </div>

      <h3 className="font-display text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
        <Link to={to} className="transition-colors hover:text-primary">
          {course.title}
        </Link>
      </h3>

      {(course.shortDescription || course.description) && (
        <p className="line-clamp-3 max-w-prose text-pretty text-muted">
          {course.shortDescription || course.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-soft pt-4 text-sm text-muted">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <User className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{instructorName(course.instructor)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
            <Clock className="size-4" aria-hidden="true" />
            {formatDuration(course.duration)}
          </span>
        </span>

        {/* Reads as the card's call to action without adding a third button
            style to the page; the heading link is what actually navigates. */}
        <span
          className="inline-flex items-center gap-1.5 font-medium text-primary"
          aria-hidden="true"
        >
          View course
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  </article>
);
