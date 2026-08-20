import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EnrollmentStatusBadge } from "@/components/courses/CourseEnrollmentsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import type {
  Course,
  Enrollment,
  EnrollmentListParams,
  EnrollmentSortField,
  EnrollmentStatistics,
  EnrollmentStatus,
  Pagination,
  SortOrder,
} from "@/types";
import { cn } from "@/utils/cn";

type LoadStatus = "loading" | "error" | "ready";

const PAGE_SIZES = [10, 25, 50] as const;

const SORT_FIELDS: EnrollmentSortField[] = ["enrolledAt", "lastAccessedAt", "status"];

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * View state lives in the URL so a filtered list survives a refresh, can be
 * handed to another admin, and steps back with the browser. Everything read
 * back out is validated — the server rejects unknown sort keys and malformed
 * course ids, and there is no reason to make it do that work twice.
 */
const readSortField = (value: string | null): EnrollmentSortField =>
  SORT_FIELDS.includes(value as EnrollmentSortField)
    ? (value as EnrollmentSortField)
    : "enrolledAt";

const readSortOrder = (value: string | null): SortOrder =>
  value === "asc" ? "asc" : "desc";

const readStatus = (value: string | null): "" | EnrollmentStatus =>
  value === "active" || value === "completed" || value === "cancelled" ? value : "";

const readCourse = (value: string | null): string =>
  value && OBJECT_ID.test(value) ? value : "";

const readLimit = (value: string | null): number =>
  PAGE_SIZES.includes(Number(value) as (typeof PAGE_SIZES)[number])
    ? Number(value)
    : PAGE_SIZES[0];

const readPage = (value: string | null): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

const studentName = (enrollment: Enrollment): string =>
  enrollment.student
    ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
    : "Deleted user";

export const AdminEnrollmentsPage = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const statusFilter = readStatus(searchParams.get("status"));
  const course = readCourse(searchParams.get("course"));
  const sortBy = readSortField(searchParams.get("sortBy"));
  const sortOrder = readSortOrder(searchParams.get("sortOrder"));
  const limit = readLimit(searchParams.get("limit"));
  const page = readPage(searchParams.get("page"));

  const [searchInput, setSearchInput] = useState(search);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [stats, setStats] = useState<EnrollmentStatistics | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [courses, setCourses] = useState<Course[]>([]);
  const [toCancel, setToCancel] = useState<Enrollment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const patchParams = useCallback(
    (patch: Record<string, string | number>, options?: { replace?: boolean }) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            const isDefault =
              value === "" ||
              (key === "page" && value === 1) ||
              (key === "limit" && value === PAGE_SIZES[0]) ||
              (key === "sortBy" && value === "enrolledAt") ||
              (key === "sortOrder" && value === "desc");
            if (isDefault) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: options?.replace ?? false }
      );
    },
    [setSearchParams]
  );

  // Course filter options. Capped at 100 by the API, so a platform with more
  // courses than that will not list every one here — the free-text search
  // still reaches them.
  useEffect(() => {
    let cancelled = false;
    coursesService
      .list({
        page: 1,
        limit: 100,
        search: "",
        category: "",
        level: "",
        status: "",
        view: "manage",
      })
      .then((result) => {
        if (!cancelled) setCourses(result.courses);
      })
      .catch(() => {
        // The filter dropdown is optional; the table still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(
      () => patchParams({ search: searchInput, page: 1 }, { replace: true }),
      350
    );
    return () => window.clearTimeout(timer);
  }, [searchInput, search, patchParams]);

  const params = useMemo<EnrollmentListParams>(
    () => ({
      page,
      limit,
      search,
      status: statusFilter,
      course: course || undefined,
      sortBy,
      sortOrder,
    }),
    [page, limit, search, statusFilter, course, sortBy, sortOrder]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await enrollmentsService.listAll(params);
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

  /**
   * Counts are supplementary — the list is the page. If this call fails the
   * tiles simply don't render; it must never take the table down with it.
   */
  const loadStats = useCallback(async () => {
    try {
      setStats((await enrollmentsService.statistics()) ?? null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const toggleSort = (field: EnrollmentSortField) => {
    // Dates start newest-first, because "most recent" is what you want from a
    // date column; a text column starts A–Z.
    const firstOrder: SortOrder = field === "status" ? "asc" : "desc";
    const nextOrder: SortOrder =
      sortBy === field ? (sortOrder === "asc" ? "desc" : "asc") : firstOrder;
    patchParams({ sortBy: field, sortOrder: nextOrder, page: 1 });
  };

  const handleCancel = async () => {
    if (!toCancel) return;
    setIsCancelling(true);
    try {
      await enrollmentsService.cancel(toCancel.id);
      showToast("Enrollment cancelled");
      setToCancel(null);
      await Promise.all([load(), loadStats()]);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The action failed. Please try again.",
        "error"
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const hasFilters = Boolean(search || statusFilter || course);

  const clearFilters = () => {
    setSearchInput("");
    patchParams({ search: "", status: "", course: "", page: 1 });
  };

  /**
   * The counts are also the quickest way to narrow the list, so each tile is
   * the filter it describes rather than a number you then apply by hand below.
   */
  const tiles = stats
    ? [
        { key: "all", label: "Total", value: stats.totalEnrollments, apply: "" },
        { key: "active", label: "Active", value: stats.activeEnrollments, apply: "active" },
        { key: "completed", label: "Completed", value: stats.completedEnrollments, apply: "completed" },
        { key: "cancelled", label: "Cancelled", value: stats.cancelledEnrollments, apply: "cancelled" },
      ]
    : [];

  const total = pagination?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  /** 44px on touch, tighter on desktop where the pointer is precise. */
  const actionButton =
    "flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors md:size-9";

  const rowActions = (enrollment: Enrollment) => (
    <div className="flex items-center gap-0.5">
      {enrollment.course && (
        <Link
          to={`/admin/courses/${enrollment.course.id}`}
          className="rounded-lg px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          View course
        </Link>
      )}
      {/* Cancelling was already possible through the API and reachable nowhere
          in the UI. A cancelled enrolment has nothing left to cancel. */}
      {enrollment.status !== "cancelled" && (
        <button
          type="button"
          onClick={() => setToCancel(enrollment)}
          aria-label={`Cancel enrollment for ${studentName(enrollment)}`}
          title="Cancel enrollment"
          className={cn(actionButton, "hover:bg-danger-soft hover:text-danger")}
        >
          <XCircle className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  /** A sortable header: a real button, with the state exposed via aria-sort. */
  const sortableHeader = ({
    label,
    field,
  }: {
    label: string;
    field: EnrollmentSortField;
  }) => {
    const isActive = sortBy === field;
    return (
      <th
        key={field}
        scope="col"
        aria-sort={isActive ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
        className="py-2 pr-4 font-medium"
      >
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {label}
          {/* Only the active column shows a caret — three of them would say
              nothing about which one is actually in effect. */}
          {isActive &&
            (sortOrder === "asc" ? (
              <ArrowUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5" aria-hidden="true" />
            ))}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Enrollments</h1>
        <p className="mt-1 text-muted">
          Every enrollment on EduNexa — across all courses and students.
        </p>
      </div>

      {tiles.length > 0 && (
        <div
          role="group"
          aria-label="Filter by status"
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        >
          {tiles.map((tile) => {
            const active = statusFilter === tile.apply;
            return (
              <button
                key={tile.key}
                type="button"
                aria-pressed={active}
                onClick={() => patchParams({ status: tile.apply, page: 1 })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  active
                    ? "border-primary/40 bg-primary-soft"
                    : "border-soft bg-surface hover:border-primary/30 hover:bg-primary-soft/40"
                )}
              >
                <span className="block font-display text-xl font-semibold tabular-nums">
                  {tile.value}
                </span>
                <span className="block text-xs text-muted">{tile.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_170px_130px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search enrollments"
                placeholder="Search by student or course…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by course"
              value={course}
              onChange={(event) => patchParams({ course: event.target.value, page: 1 })}
            >
              <option value="">All courses</option>
              {courses.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => patchParams({ status: event.target.value, page: 1 })}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              aria-label="Rows per page"
              value={String(limit)}
              onChange={(event) => patchParams({ limit: event.target.value, page: 1 })}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </Select>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-label="Loading enrollments">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load enrollments.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                The list didn’t load. Your filters are kept — try again.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && enrollments.length === 0 && (
            <div className="py-12 text-center">
              <GraduationCap className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">No enrollments found.</p>
              <p className="mt-1 text-sm text-muted">
                Try changing your search or filters.
              </p>
              {/* Without this, a filtered-to-nothing view is a dead end. */}
              {hasFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {status === "ready" && enrollments.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Enrollments, sorted by {sortBy}{" "}
                    {sortOrder === "asc" ? "ascending" : "descending"}
                  </caption>
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Student
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Course
                      </th>
                      {sortableHeader({ label: "Enrolled", field: "enrolledAt" })}
                      {sortableHeader({ label: "Status", field: "status" })}
                      {sortableHeader({ label: "Last accessed", field: "lastAccessedAt" })}
                      <th scope="col" className="py-2 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment) => (
                      <tr
                        key={enrollment.id}
                        className="border-b border-soft transition-colors last:border-0 hover:bg-paper"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{studentName(enrollment)}</p>
                          <p className="text-xs text-muted">
                            {enrollment.student?.email ?? "—"}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          {enrollment.course ? (
                            <Link
                              to={`/admin/courses/${enrollment.course.id}`}
                              className="font-medium transition-colors hover:text-primary"
                            >
                              {enrollment.course.title}
                            </Link>
                          ) : (
                            <span className="text-muted">Deleted course</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted tabular-nums">
                          {new Date(enrollment.enrolledAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4">
                          <EnrollmentStatusBadge status={enrollment.status} />
                        </td>
                        <td className="py-3 pr-4 text-muted tabular-nums">
                          {enrollment.lastAccessedAt
                            ? new Date(enrollment.lastAccessedAt).toLocaleString()
                            : "Never"}
                        </td>
                        <td className="py-3">{rowActions(enrollment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards — a six-column table is a sideways drag on a phone. */}
              <ul className="space-y-3 md:hidden" aria-label="Enrollments">
                {enrollments.map((enrollment) => (
                  <li key={enrollment.id} className="rounded-xl border border-soft p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{studentName(enrollment)}</p>
                        <p className="text-sm break-all text-muted">
                          {enrollment.student?.email ?? "—"}
                        </p>
                      </div>
                      <EnrollmentStatusBadge status={enrollment.status} />
                    </div>

                    <p className="mt-3 text-sm">
                      {enrollment.course ? (
                        <Link
                          to={`/admin/courses/${enrollment.course.id}`}
                          className="font-medium transition-colors hover:text-primary"
                        >
                          {enrollment.course.title}
                        </Link>
                      ) : (
                        <span className="text-muted">Deleted course</span>
                      )}
                    </p>

                    <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <div className="flex gap-1">
                          <dt>Enrolled</dt>
                          <dd className="font-medium text-ink tabular-nums">
                            {new Date(enrollment.enrolledAt).toLocaleDateString()}
                          </dd>
                        </div>
                        <div className="flex gap-1">
                          <dt>Last seen</dt>
                          <dd className="font-medium text-ink tabular-nums">
                            {enrollment.lastAccessedAt
                              ? new Date(enrollment.lastAccessedAt).toLocaleDateString()
                              : "Never"}
                          </dd>
                        </div>
                      </dl>
                      {/* Cancelling is reachable on a phone too, not only in
                          the desktop table. */}
                      {enrollment.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => setToCancel(enrollment)}
                          aria-label={`Cancel enrollment for ${studentName(enrollment)}`}
                          className={cn(
                            actionButton,
                            "hover:bg-danger-soft hover:text-danger"
                          )}
                        >
                          <XCircle className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {status === "ready" && pagination && enrollments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              {/* Announced, so filtering with a screen reader gives some signal
                  that the result set changed. */}
              <p className="text-sm text-muted tabular-nums" aria-live="polite">
                {rangeStart}–{rangeEnd} of {total} enrollment{total === 1 ? "" : "s"}
                {pagination.totalPages > 1 &&
                  ` — page ${pagination.page} of ${pagination.totalPages}`}
              </p>
              {pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => patchParams({ page: pagination.page - 1 })}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => patchParams({ page: pagination.page + 1 })}
                  >
                    Next
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {toCancel && (
        <ConfirmDialog
          open
          title="Cancel enrollment"
          message={`${studentName(toCancel)} will lose access to ${
            toCancel.course?.title ?? "this course"
          }.

Their progress and any certificate are kept.`}
          confirmLabel="Cancel enrollment"
          isLoading={isCancelling}
          onConfirm={() => void handleCancel()}
          onCancel={() => setToCancel(null)}
        />
      )}
    </div>
  );
};
