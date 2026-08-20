import { ChevronLeft, ChevronRight, PlayCircle, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CategoryBadge, LevelBadge } from "@/components/CourseBadges";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { enrollmentsService } from "@/services/enrollments.service";
import type {
  Enrollment,
  EnrollmentListParams,
  EnrollmentStatus,
  Pagination,
} from "@/types";

type LoadStatus = "loading" | "error" | "ready";

const statusBadgeVariant: Record<EnrollmentStatus, "success" | "aubergine" | "muted"> = {
  active: "success",
  completed: "aubergine",
  cancelled: "muted",
};

export const MyCoursesPage = () => {
  const { showToast } = useToast();

  const [params, setParams] = useState<EnrollmentListParams>({
    page: 1,
    limit: 9,
    search: "",
    status: "",
    // Newest enrolment first — the server's existing default, now explicit.
    sortBy: "enrolledAt",
    sortOrder: "desc",
  });
  const [searchInput, setSearchInput] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [cancelTarget, setCancelTarget] = useState<Enrollment | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams((prev) =>
        prev.search === searchInput ? prev : { ...prev, page: 1, search: searchInput }
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await enrollmentsService.myCourses(params);
      setEnrollments(result.enrollments);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReEnroll = async (enrollment: Enrollment) => {
    if (!enrollment.course) return;
    try {
      await enrollmentsService.enroll(enrollment.course.id);
      showToast("Successfully enrolled in course");
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Re-enrollment failed. Please try again.",
        "error"
      );
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setIsActionLoading(true);
    try {
      await enrollmentsService.cancel(cancelTarget.id);
      showToast("Enrollment cancelled");
      setCancelTarget(null);
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsActionLoading(false);
    }
  };

  const hasFilters = Boolean(params.search || params.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My courses</h1>
          <p className="mt-1 text-muted">Everything you're enrolled in, in one place.</p>
        </div>
        <Link to="/courses">
          <Button variant="outline">Browse courses</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search my courses"
            placeholder="Search by course title…"
            className="pl-9"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by enrollment status"
          value={params.status}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              page: 1,
              status: event.target.value as "" | EnrollmentStatus,
            }))
          }
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading courses">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="py-16 text-center">
          <p className="font-medium">Unable to load your courses.</p>
          <p className="mt-1 text-sm text-muted">Please try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {status === "ready" && enrollments.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-medium">
            {hasFilters
              ? "No courses match your search or filters."
              : "You haven't enrolled in any courses yet."}
          </p>
          {!hasFilters && (
            <Link to="/courses">
              <Button className="mt-4">Browse Courses</Button>
            </Link>
          )}
        </div>
      )}

      {status === "ready" && enrollments.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((enrollment) => {
              const course = enrollment.course;
              return (
                <article
                  key={enrollment.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-soft bg-surface shadow-[0_1px_2px_rgba(35,26,38,0.06)]"
                >
                  <div className="h-32 shrink-0">
                    <CourseThumbnail
                      course={{
                        title: course?.title ?? "Course",
                        thumbnail: course?.thumbnail,
                      }}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg leading-snug font-semibold">
                        {course ? (
                          <Link to={`/courses/${course.slug}`} className="hover:text-primary">
                            {course.title}
                          </Link>
                        ) : (
                          "Course unavailable"
                        )}
                      </h3>
                      <Badge variant={statusBadgeVariant[enrollment.status]}>
                        {enrollment.status === "active"
                          ? "Active"
                          : enrollment.status === "completed"
                            ? "Completed"
                            : "Cancelled"}
                      </Badge>
                    </div>

                    {course && (
                      <>
                        <p className="text-sm text-muted">{course.instructorName}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <CategoryBadge category={course.category} />
                          <LevelBadge level={course.level} />
                        </div>
                      </>
                    )}

                    <p className="mt-auto text-xs text-muted">
                      Enrolled: {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 border-t border-soft pt-3">
                      {enrollment.status === "active" && course && (
                        <>
                          <Link to={`/student/courses/${course.id}/learn`} className="flex-1">
                            <Button size="sm" className="w-full">
                              <PlayCircle className="size-4" aria-hidden="true" />
                              Continue Learning
                            </Button>
                          </Link>
                          <button
                            type="button"
                            onClick={() => setCancelTarget(enrollment)}
                            className="text-xs text-muted hover:text-danger"
                          >
                            Cancel enrollment
                          </button>
                        </>
                      )}
                      {enrollment.status === "cancelled" && course && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => void handleReEnroll(enrollment)}
                        >
                          Re-enroll
                        </Button>
                      )}
                      {enrollment.status === "completed" && course && (
                        <Link to={`/student/courses/${course.id}/learn`} className="w-full">
                          <Button size="sm" variant="outline" className="w-full">
                            Review course
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setParams((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Button>
              <p className="text-sm text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setParams((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}

      {cancelTarget && (
        <ConfirmDialog
          open
          title="Cancel enrollment"
          message={`Are you sure you want to cancel your enrollment in "${cancelTarget.course?.title ?? "this course"}"?\n\nYou will lose access to its protected lessons, but you can re-enroll at any time.`}
          confirmLabel="Cancel enrollment"
          isLoading={isActionLoading}
          onConfirm={() => void handleCancel()}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
};
