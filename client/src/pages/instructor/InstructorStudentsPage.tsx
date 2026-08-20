import { Award, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EnrollmentStatusBadge } from "@/components/courses/CourseEnrollmentsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesService } from "@/services/courses.service";
import { teachingService } from "@/services/teaching.service";
import type {
  Course,
  EnrollmentStatus,
  Pagination,
  TeachingStudentRow,
  TeachingStudentsParams,
} from "@/types";

type LoadStatus = "loading" | "error" | "ready";

const SORT_OPTIONS: { value: TeachingStudentsParams["sortBy"]; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "progress", label: "Progress" },
  { value: "enrolledAt", label: "Recently enrolled" },
  { value: "lastAccessedAt", label: "Recently active" },
];

/** Everyone enrolled in the courses you teach — one row per enrolment. */
export const InstructorStudentsPage = () => {
  const [params, setParams] = useState<TeachingStudentsParams>({
    page: 1,
    limit: 20,
    search: "",
    course: "",
    status: "",
    sortBy: "name",
    sortOrder: "asc",
  });
  const [searchInput, setSearchInput] = useState("");
  const [students, setStudents] = useState<TeachingStudentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [courses, setCourses] = useState<Course[]>([]);

  // Course filter options — the instructor's own courses.
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
        // The dropdown is a convenience; the roster works without it.
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
      const result = await teachingService.students(params);
      setStudents(result.students);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const isFiltered =
    params.search.trim() !== "" || params.course !== "" || params.status !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My students</h1>
          <p className="mt-1 text-muted">
            Everyone enrolled in the courses you teach. Someone in two of your courses
            appears once per course.
          </p>
        </div>
        <Link to="/instructor/dashboard">
          <Button variant="outline">Dashboard</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_150px_170px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search students"
                placeholder="Search by name or email…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by course"
              value={params.course}
              onChange={(event) =>
                setParams((prev) => ({ ...prev, page: 1, course: event.target.value }))
              }
            >
              <option value="">All my courses</option>
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
            <Select
              aria-label="Sort students"
              value={params.sortBy}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  page: 1,
                  sortBy: event.target.value as TeachingStudentsParams["sortBy"],
                  // Names read best A–Z; the others are most useful highest-first.
                  sortOrder: event.target.value === "name" ? "asc" : "desc",
                }))
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </Select>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading students…</p>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load your students.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && students.length === 0 && (
            <div className="py-12 text-center">
              <Users className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">
                {isFiltered ? "No students match your filters." : "Nobody is enrolled yet."}
              </p>
              <p className="mt-1 text-sm text-muted">
                {isFiltered
                  ? "Try a different search, course or status."
                  : "Publish a course and students will appear here as they enrol."}
              </p>
              {!isFiltered && (
                <Link to="/instructor/courses">
                  <Button className="mt-4">Go to my courses</Button>
                </Link>
              )}
            </div>
          )}

          {status === "ready" && students.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Student</th>
                      <th className="py-2 pr-4 font-medium">Course</th>
                      <th className="py-2 pr-4 font-medium">Progress</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((row) => (
                      <tr
                        key={row.enrollmentId}
                        className="border-b border-soft last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">
                            {row.firstName} {row.lastName}
                          </p>
                          <p className="text-xs text-muted">{row.email || "—"}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <Link
                            to={`/instructor/courses/${row.courseId}`}
                            className="transition-colors hover:text-primary"
                          >
                            {row.courseTitle}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="min-w-[9rem]">
                            <Progress
                              value={row.progressPercentage}
                              label={`${row.progressPercentage}% — ${row.completedLessons}/${row.totalLessons} lessons, ${row.passedRequiredQuizzes}/${row.totalRequiredQuizzes} quizzes`}
                            />
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <EnrollmentStatusBadge status={row.status} />
                            {row.certificateIssued && (
                              <Badge variant="aubergine">
                                <Award className="mr-1 inline size-3" aria-hidden="true" />
                                Certified
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-muted">
                          {row.lastAccessedAt
                            ? new Date(row.lastAccessedAt).toLocaleDateString()
                            : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden" aria-label="My students">
                {students.map((row) => (
                  <li key={row.enrollmentId} className="rounded-xl border border-soft p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {row.firstName} {row.lastName}
                        </p>
                        <p className="text-sm break-all text-muted">{row.email || "—"}</p>
                      </div>
                      <EnrollmentStatusBadge status={row.status} />
                    </div>

                    <p className="mt-2 text-sm">
                      <Link
                        to={`/instructor/courses/${row.courseId}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        {row.courseTitle}
                      </Link>
                    </p>

                    <div className="mt-3">
                      <Progress
                        value={row.progressPercentage}
                        label={`${row.progressPercentage}% complete`}
                      />
                    </div>

                    <p className="mt-2 text-xs text-muted">
                      {row.completedLessons}/{row.totalLessons} lessons ·{" "}
                      {row.passedRequiredQuizzes}/{row.totalRequiredQuizzes} required
                      quizzes ·{" "}
                      {row.lastAccessedAt
                        ? `last active ${new Date(row.lastAccessedAt).toLocaleDateString()}`
                        : "never opened"}
                      {row.certificateIssued && " · certified"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pagination && pagination.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              <p className="text-sm text-muted">
                {pagination.total} enrolment{pagination.total === 1 ? "" : "s"}
                {pagination.totalPages > 1 &&
                  ` — page ${pagination.page} of ${pagination.totalPages}`}
              </p>
              {pagination.totalPages > 1 && (
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
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
