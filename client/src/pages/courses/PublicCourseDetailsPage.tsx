import { ArrowLeft, Clock, GraduationCap, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CategoryBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseContentTree } from "@/components/courses/CourseContentTree";
import { EnrollmentPanel } from "@/components/courses/EnrollmentPanel";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesService } from "@/services/courses.service";
import type { Course } from "@/types";
import { formatDuration, instructorName, levelLabels } from "@/utils/courseMeta";

/** Public details for a published course, addressed by slug. */
export const PublicCourseDetailsPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    if (!slug) return;
    setStatus("loading");
    try {
      setCourse(await coursesService.get(slug));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All courses
      </Link>

      {status === "loading" && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium">This course isn't available.</p>
            <p className="mt-1 text-sm text-muted">
              It may have been unpublished or removed.
            </p>
            <Link to="/courses">
              <Button variant="outline" className="mt-4">
                Browse other courses
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "ready" && course && (
        <Card className="overflow-hidden">
          <div className="h-56 border-b border-soft">
            <CourseThumbnail course={course} />
          </div>
          <CardContent className="space-y-6 py-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={course.category} />
                <LevelBadge level={course.level} />
              </div>
              <h1 className="mt-3 font-display text-3xl font-semibold">{course.title}</h1>
              {course.shortDescription && (
                <p className="mt-2 text-muted">{course.shortDescription}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-4" aria-hidden="true" />
                {instructorName(course.instructor)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden="true" />
                {formatDuration(course.duration)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-4" aria-hidden="true" />
                {levelLabels[course.level]}
              </span>
            </div>

            <div className="border-t border-soft pt-5">
              <h2 className="font-display text-lg font-semibold">About this course</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                {course.description}
              </p>
            </div>

            <EnrollmentPanel courseId={course.id} />

            <div className="border-t border-soft pt-5">
              <h2 className="mb-3 font-display text-lg font-semibold">Course Content</h2>
              <CourseContentTree courseId={course.id} courseSlug={course.slug} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
