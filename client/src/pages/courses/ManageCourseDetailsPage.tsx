import {
  Archive,
  ArrowLeft,
  ClipboardList,
  Pencil,
  Rocket,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CourseContentManager } from "@/components/courses/CourseContentManager";
import { CourseEnrollmentsCard } from "@/components/courses/CourseEnrollmentsCard";
import { CategoryBadge, CourseStatusBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import type { Course, CourseCompletionStatistics, CourseStatus } from "@/types";
import { formatDuration, instructorName } from "@/utils/courseMeta";

interface ManageCourseDetailsPageProps {
  variant: "admin" | "instructor";
}

export const ManageCourseDetailsPage = ({ variant }: ManageCourseDetailsPageProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const basePath = variant === "admin" ? "/admin/courses" : "/instructor/courses";

  const [course, setCourse] = useState<Course | null>(null);
  const [completionStats, setCompletionStats] =
    useState<CourseCompletionStatistics | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [confirmType, setConfirmType] = useState<"delete" | "archive" | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus("loading");
    try {
      setCourse(await coursesService.get(id));
      setStatus("ready");
    } catch {
      setStatus("error");
    }

    try {
      setCompletionStats(await certificatesService.courseCompletionStatistics(id));
    } catch {
      // Secondary panel — the page is still useful without these counts.
      setCompletionStats(null);
    }
  }, [id]);

  // Refreshes content statistics without flashing the loading state.
  const refreshCourseSilently = useCallback(async () => {
    if (!id) return;
    try {
      setCourse(await coursesService.get(id));
    } catch {
      // Stats refresh is best-effort; the visible content is already current.
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (next: CourseStatus) => {
    if (!course) return;
    try {
      const updated = await coursesService.setStatus(course.id, next);
      setCourse(updated);
      showToast(
        next === "published"
          ? "Course published"
          : next === "archived"
            ? "Course archived"
            : "Course moved to draft"
      );
      setConfirmType(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    }
  };

  const handleConfirm = async () => {
    if (!course || !confirmType) return;
    setIsActionLoading(true);
    try {
      if (confirmType === "delete") {
        await coursesService.remove(course.id);
        showToast("Course deleted");
        navigate(basePath, { replace: true });
        return;
      }
      await changeStatus("archived");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const canDelete =
    course !== null && (variant === "admin" || course.status !== "published");
  const isOwner = course?.instructor?.id === user?.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={basePath}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to courses
      </Link>

      {status === "loading" && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Unable to load this course.</p>
            <p className="mt-1 text-sm text-muted">
              It may have been deleted, or you may not have access to it.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="outline" onClick={() => void load()}>
                Retry
              </Button>
              <Link to={basePath}>
                <Button variant="ghost">Back to courses</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "ready" && course && (
        <>
          <Card className="overflow-hidden">
            <div className="h-48 border-b border-soft">
              <CourseThumbnail course={course} />
            </div>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{course.title}</CardTitle>
                  {course.shortDescription && (
                    <p className="mt-1 text-sm text-muted">{course.shortDescription}</p>
                  )}
                </div>
                <CourseStatusBadge status={course.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge category={course.category} />
                <LevelBadge level={course.level} />
              </div>

              <p className="text-sm leading-relaxed whitespace-pre-line">
                {course.description}
              </p>

              <dl className="grid grid-cols-1 gap-4 border-t border-soft pt-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Instructor</dt>
                  <dd className="mt-0.5 font-medium">
                    {instructorName(course.instructor)}
                    {isOwner && <span className="ml-1 text-muted">(you)</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Duration</dt>
                  <dd className="mt-0.5 font-medium">{formatDuration(course.duration)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Created</dt>
                  <dd className="mt-0.5 font-medium">
                    {new Date(course.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Last updated</dt>
                  <dd className="mt-0.5 font-medium">
                    {new Date(course.updatedAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Public URL</dt>
                  <dd className="mt-0.5 font-medium">
                    {course.status === "published" ? (
                      <Link to={`/courses/${course.slug}`} className="text-primary hover:text-primary-strong">
                        /courses/{course.slug}
                      </Link>
                    ) : (
                      <span className="text-muted">Visible once published</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-3 border-t border-soft pt-5">
                <Link to={`${basePath}/${course.id}/edit`}>
                  <Button variant="outline">
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit
                  </Button>
                </Link>
                <Link to={`${basePath}/${course.id}/quizzes`}>
                  <Button variant="outline">
                    <ClipboardList className="size-4" aria-hidden="true" />
                    Quizzes
                  </Button>
                </Link>
                {course.status !== "published" && (
                  <Button variant="outline" onClick={() => void changeStatus("published")}>
                    <Rocket className="size-4" aria-hidden="true" />
                    Publish
                  </Button>
                )}
                {course.status !== "archived" && (
                  <Button variant="outline" onClick={() => setConfirmType("archive")}>
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </Button>
                )}
                {course.status !== "draft" && (
                  <Button variant="outline" onClick={() => void changeStatus("draft")}>
                    <Undo2 className="size-4" aria-hidden="true" />
                    Move to draft
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="outline"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setConfirmType("delete")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {completionStats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Enrolled Students", value: completionStats.enrolledStudents },
                { label: "Completed Students", value: completionStats.completedStudents },
                { label: "Certificates Issued", value: completionStats.certificatesIssued },
                { label: "Completion Rate", value: `${completionStats.completionRate}%` },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardContent className="py-4">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                      {value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {course.contentStats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Total Modules", value: course.contentStats.totalModules },
                { label: "Published Modules", value: course.contentStats.publishedModules },
                { label: "Total Lessons", value: course.contentStats.totalLessons },
                { label: "Published Lessons", value: course.contentStats.publishedLessons },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardContent className="py-4">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <CourseContentManager
            courseId={course.id}
            onContentChanged={() => void refreshCourseSilently()}
          />

          <CourseEnrollmentsCard courseId={course.id} />
        </>
      )}

      {confirmType && course && (
        <ConfirmDialog
          open
          title={confirmType === "delete" ? "Delete course" : "Archive course"}
          message={
            confirmType === "delete"
              ? `Are you sure you want to delete "${course.title}"?\n\nThis action cannot be undone.`
              : `Are you sure you want to archive "${course.title}"?\n\nIt will no longer appear in the course catalog.`
          }
          confirmLabel={confirmType === "delete" ? "Delete course" : "Archive"}
          isLoading={isActionLoading}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmType(null)}
        />
      )}
    </div>
  );
};
