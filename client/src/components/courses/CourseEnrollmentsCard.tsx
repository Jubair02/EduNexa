import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { enrollmentsService } from "@/services/enrollments.service";
import type {
  Enrollment,
  EnrollmentListParams,
  EnrollmentStatus,
  Pagination,
} from "@/types";

const statusVariant: Record<EnrollmentStatus, "success" | "aubergine" | "muted"> = {
  active: "success",
  completed: "aubergine",
  cancelled: "muted",
};

export const EnrollmentStatusBadge = ({ status }: { status: EnrollmentStatus }) => (
  <Badge variant={statusVariant[status]}>
    {status.charAt(0).toUpperCase() + status.slice(1)}
  </Badge>
);

/** Enrolled-students list on the admin/instructor course details page. */
export const CourseEnrollmentsCard = ({ courseId }: { courseId: string }) => {
  const [params, setParams] = useState<EnrollmentListParams>({
    page: 1,
    limit: 10,
    search: "",
    status: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

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
      const result = await enrollmentsService.listByCourse(courseId, params);
      setEnrollments(result.enrollments);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [courseId, params]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">Enrolled Students</CardTitle>
        {pagination && (
          <p className="text-sm text-muted">
            {pagination.total} enrollment{pagination.total === 1 ? "" : "s"}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search enrolled students"
              placeholder="Search by name or email…"
              className="pl-9"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Select
            aria-label="Filter enrollments by status"
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
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="py-8 text-center">
            <p className="font-medium">Unable to load enrollments.</p>
            <Button variant="outline" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        {status === "ready" && enrollments.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {params.search || params.status
              ? "No enrollments match your search or filters."
              : "No students have enrolled yet."}
          </p>
        )}

        {status === "ready" && enrollments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-soft text-xs text-muted uppercase">
                  <th className="py-2 pr-4 font-medium">Student</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Enrolled</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Last accessed</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id} className="border-b border-soft last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      {enrollment.student
                        ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
                        : "Deleted user"}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {enrollment.student?.email ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-muted">
                      {new Date(enrollment.enrolledAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4">
                      <EnrollmentStatusBadge status={enrollment.status} />
                    </td>
                    <td className="py-3 text-muted">
                      {enrollment.lastAccessedAt
                        ? new Date(enrollment.lastAccessedAt).toLocaleString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-soft pt-3">
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
      </CardContent>
    </Card>
  );
};
