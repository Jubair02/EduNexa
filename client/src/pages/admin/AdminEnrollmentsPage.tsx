import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnrollmentStatusBadge } from "@/components/courses/CourseEnrollmentsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import type {
  Course,
  Enrollment,
  EnrollmentListParams,
  EnrollmentStatus,
  Pagination,
} from "@/types";

type LoadStatus = "loading" | "error" | "ready";

export const AdminEnrollmentsPage = () => {
  const [params, setParams] = useState<EnrollmentListParams>({
    page: 1,
    limit: 10,
    search: "",
    status: "",
    course: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [courses, setCourses] = useState<Course[]>([]);

  // Course filter options.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Enrollments</h1>
        <p className="mt-1 text-muted">
          Every enrollment on EduNexa — across all courses and students.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_170px]">
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
              value={params.course ?? ""}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, page: 1, course: event.target.value }))
              }
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by status"
              value={params.status}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  page: 1,
                  status: event.target.value as "" | EnrollmentStatus,
                }))
              }
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && enrollments.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-medium">No enrollments found.</p>
              <p className="mt-1 text-sm text-muted">
                Try changing your search or filters.
              </p>
            </div>
          )}

          {status === "ready" && enrollments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-soft text-xs text-muted uppercase">
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Course</th>
                    <th className="py-2 pr-4 font-medium">Enrolled</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Last accessed</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enrollment) => (
                    <tr key={enrollment.id} className="border-b border-soft last:border-0">
                      <td className="py-3 pr-4">
                        <p className="font-medium">
                          {enrollment.student
                            ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
                            : "Deleted user"}
                        </p>
                        <p className="text-xs text-muted">
                          {enrollment.student?.email ?? "—"}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        {enrollment.course ? (
                          <Link
                            to={`/admin/courses/${enrollment.course.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {enrollment.course.title}
                          </Link>
                        ) : (
                          <span className="text-muted">Deleted course</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {new Date(enrollment.enrolledAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <EnrollmentStatusBadge status={enrollment.status} />
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {enrollment.lastAccessedAt
                          ? new Date(enrollment.lastAccessedAt).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="py-3">
                        {enrollment.course && (
                          <Link
                            to={`/admin/courses/${enrollment.course.id}`}
                            className="text-sm font-medium text-primary hover:text-primary-strong"
                          >
                            View course
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              <p className="text-sm text-muted">
                {pagination.total} enrollment{pagination.total === 1 ? "" : "s"} — page{" "}
                {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setParams((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous
                </Button>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
