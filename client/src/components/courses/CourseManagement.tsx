import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Rocket,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CourseCard } from "@/components/CourseCard";
import { CategoryBadge, CourseStatusBadge, LevelBadge } from "@/components/CourseBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { coursesService } from "@/services/courses.service";
import type {
  Course,
  CourseCategory,
  CourseLevel,
  CourseListParams,
  CourseStatus,
  Pagination,
} from "@/types";
import { COURSE_CATEGORIES } from "@/types";
import { categoryLabels, instructorName, levelLabels } from "@/utils/courseMeta";

type LoadStatus = "loading" | "error" | "ready";

interface ConfirmAction {
  type: "delete" | "archive";
  course: Course;
}

interface CourseManagementProps {
  /** admin manages every course; instructor manages only their own. */
  variant: "admin" | "instructor";
}

/** Shared course management screen for /admin/courses and /instructor/courses. */
export const CourseManagement = ({ variant }: CourseManagementProps) => {
  const { showToast } = useToast();
  const basePath = variant === "admin" ? "/admin/courses" : "/instructor/courses";

  const [params, setParams] = useState<CourseListParams>({
    page: 1,
    limit: 10,
    search: "",
    category: "",
    level: "",
    status: "",
    view: "manage",
  });
  const [searchInput, setSearchInput] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
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
      const result = await coursesService.list(params);
      setCourses(result.courses);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilter = (patch: Partial<CourseListParams>) => {
    setParams((prev) => ({ ...prev, ...patch, page: 1 }));
  };

  const changeStatus = async (course: Course, next: CourseStatus) => {
    try {
      await coursesService.setStatus(course.id, next);
      showToast(
        next === "published"
          ? "Course published"
          : next === "archived"
            ? "Course archived"
            : "Course moved to draft"
      );
      await load();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, course } = confirmAction;
    setIsActionLoading(true);
    try {
      if (type === "delete") {
        await coursesService.remove(course.id);
        showToast("Course deleted");
      } else {
        await coursesService.setStatus(course.id, "archived");
        showToast("Course archived");
      }
      setConfirmAction(null);
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

  // Instructors can only delete drafts (or archived courses); the backend
  // enforces this — the UI simply doesn't offer the dead-end action.
  const canDelete = (course: Course) =>
    variant === "admin" || course.status !== "published";

  const rowActions = (course: Course) => (
    <div className="flex items-center gap-1">
      <Link
        to={`${basePath}/${course.id}`}
        aria-label={`View ${course.title}`}
        className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
      >
        <Eye className="size-4" aria-hidden="true" />
      </Link>
      <Link
        to={`${basePath}/${course.id}/edit`}
        aria-label={`Edit ${course.title}`}
        className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </Link>
      {course.status !== "published" && (
        <button
          type="button"
          onClick={() => void changeStatus(course, "published")}
          aria-label={`Publish ${course.title}`}
          className="rounded-lg p-2 text-muted hover:bg-success-soft hover:text-success"
        >
          <Rocket className="size-4" aria-hidden="true" />
        </button>
      )}
      {course.status !== "archived" && (
        <button
          type="button"
          onClick={() => setConfirmAction({ type: "archive", course })}
          aria-label={`Archive ${course.title}`}
          className="rounded-lg p-2 text-muted hover:bg-primary-soft hover:text-ink"
        >
          <Archive className="size-4" aria-hidden="true" />
        </button>
      )}
      {canDelete(course) && (
        <button
          type="button"
          onClick={() => setConfirmAction({ type: "delete", course })}
          aria-label={`Delete ${course.title}`}
          className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {variant === "admin" ? "Courses" : "My courses"}
          </h1>
          <p className="mt-1 text-muted">
            {variant === "admin"
              ? "Every course on EduNexa — across all instructors."
              : "Create, edit, and publish the courses you teach."}
          </p>
        </div>
        <Link to={`${basePath}/new`}>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            Create course
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_150px_150px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search courses"
                placeholder="Search by title or description…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by category"
              value={params.category}
              onChange={(event) =>
                setFilter({ category: event.target.value as "" | CourseCategory })
              }
            >
              <option value="">All categories</option>
              {COURSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {categoryLabels[value]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by level"
              value={params.level}
              onChange={(event) => setFilter({ level: event.target.value as "" | CourseLevel })}
            >
              <option value="">All levels</option>
              {(Object.keys(levelLabels) as CourseLevel[]).map((value) => (
                <option key={value} value={value}>
                  {levelLabels[value]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by status"
              value={params.status}
              onChange={(event) =>
                setFilter({ status: event.target.value as "" | CourseStatus })
              }
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-label="Loading courses">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load courses.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && courses.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-medium">No courses found.</p>
              <p className="mt-1 text-sm text-muted">
                {params.search || params.category || params.level || params.status
                  ? "Try changing your search or filters."
                  : "Create your first course to get started."}
              </p>
            </div>
          )}

          {status === "ready" && courses.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Course</th>
                      {variant === "admin" && (
                        <th className="py-2 pr-4 font-medium">Instructor</th>
                      )}
                      <th className="py-2 pr-4 font-medium">Category</th>
                      <th className="py-2 pr-4 font-medium">Level</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Created</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => (
                      <tr key={course.id} className="border-b border-soft last:border-0">
                        <td className="max-w-64 py-3 pr-4">
                          <Link
                            to={`${basePath}/${course.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {course.title}
                          </Link>
                        </td>
                        {variant === "admin" && (
                          <td className="py-3 pr-4 text-muted">
                            {instructorName(course.instructor)}
                          </td>
                        )}
                        <td className="py-3 pr-4">
                          <CategoryBadge category={course.category} />
                        </td>
                        <td className="py-3 pr-4">
                          <LevelBadge level={course.level} />
                        </td>
                        <td className="py-3 pr-4">
                          <CourseStatusBadge status={course.status} />
                        </td>
                        <td className="py-3 pr-4 text-muted">
                          {new Date(course.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3">{rowActions(course)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    to={`${basePath}/${course.id}`}
                    showStatus
                    actions={rowActions(course)}
                  />
                ))}
              </div>

              {pagination && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
                  <p className="text-sm text-muted">
                    {pagination.total} course{pagination.total === 1 ? "" : "s"}
                    {pagination.totalPages > 1 &&
                      ` — page ${pagination.page} of ${pagination.totalPages}`}
                  </p>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page <= 1}
                        onClick={() =>
                          setParams((prev) => ({ ...prev, page: prev.page - 1 }))
                        }
                      >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pagination.page >= pagination.totalPages}
                        onClick={() =>
                          setParams((prev) => ({ ...prev, page: prev.page + 1 }))
                        }
                      >
                        Next
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {confirmAction && (
        <ConfirmDialog
          open
          title={confirmAction.type === "delete" ? "Delete course" : "Archive course"}
          message={
            confirmAction.type === "delete"
              ? `Are you sure you want to delete "${confirmAction.course.title}"?\n\nThis action cannot be undone.`
              : `Are you sure you want to archive "${confirmAction.course.title}"?\n\nIt will no longer appear in the course catalog.`
          }
          confirmLabel={confirmAction.type === "delete" ? "Delete course" : "Archive"}
          isLoading={isActionLoading}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};
