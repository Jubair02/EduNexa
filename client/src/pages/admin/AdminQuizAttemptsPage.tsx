import { ChevronLeft, ChevronRight, ClipboardList, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { quizzesService } from "@/services/quizzes.service";
import type { AttemptListParams, AttemptWithStudent, Pagination } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

/** Platform-wide quiz attempt log for admins. */
export const AdminQuizAttemptsPage = () => {
  const [params, setParams] = useState<AttemptListParams>({
    page: 1,
    limit: 10,
    search: "",
    passed: "",
  });
  const [searchInput, setSearchInput] = useState("");
  const [attempts, setAttempts] = useState<AttemptWithStudent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

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
      const result = await quizzesService.allAttempts(params);
      setAttempts(result.attempts);
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
        <h1 className="font-display text-3xl font-semibold">Quiz attempts</h1>
        <p className="mt-1 text-muted">
          Every quiz submission on EduNexa. Quizzes themselves are managed inside each
          course.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search attempts"
                placeholder="Search by student or quiz…"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by result"
              value={params.passed}
              onChange={(event) =>
                setParams((prev) => ({
                  ...prev,
                  page: 1,
                  passed: event.target.value as AttemptListParams["passed"],
                }))
              }
            >
              <option value="">All results</option>
              <option value="true">Passed</option>
              <option value="false">Failed</option>
            </Select>
          </div>

          {status === "loading" && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading attempts…</p>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-12 text-center">
              <p className="font-medium">Unable to load quiz attempts.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && attempts.length === 0 && (
            <div className="py-12 text-center">
              <ClipboardList className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">No quiz attempts found.</p>
              <p className="mt-1 text-sm text-muted">
                Attempts appear here as students submit quizzes.
              </p>
            </div>
          )}

          {status === "ready" && attempts.length > 0 && (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Student</th>
                      <th className="py-2 pr-4 font-medium">Quiz</th>
                      <th className="py-2 pr-4 font-medium">Score</th>
                      <th className="py-2 pr-4 font-medium">Result</th>
                      <th className="py-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.attemptId} className="border-b border-soft last:border-0">
                        <td className="py-3 pr-4">
                          <p className="font-medium">
                            {attempt.student
                              ? `${attempt.student.firstName} ${attempt.student.lastName}`
                              : "Deleted user"}
                          </p>
                          <p className="text-xs text-muted">
                            {attempt.student?.email ?? "—"}
                          </p>
                        </td>
                        <td className="py-3 pr-4">{attempt.quizTitle || "—"}</td>
                        <td className="py-3 pr-4 tabular-nums">
                          {attempt.score}/{attempt.totalPoints}{" "}
                          <span className="text-muted">({attempt.percentage}%)</span>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={attempt.passed ? "success" : "muted"}>
                            {attempt.passed ? "Passed" : "Failed"}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted">
                          {new Date(attempt.submittedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards — a five-column table is a sideways drag on a phone. */}
              <ul className="space-y-3 md:hidden" aria-label="Quiz attempts">
                {attempts.map((attempt) => (
                  <li key={attempt.attemptId} className="rounded-xl border border-soft p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {attempt.student
                            ? `${attempt.student.firstName} ${attempt.student.lastName}`
                            : "Deleted user"}
                        </p>
                        <p className="text-sm break-all text-muted">
                          {attempt.student?.email ?? "—"}
                        </p>
                      </div>
                      <Badge variant={attempt.passed ? "success" : "muted"}>
                        {attempt.passed ? "Passed" : "Failed"}
                      </Badge>
                    </div>

                    <p className="mt-3 text-sm font-medium">{attempt.quizTitle || "—"}</p>

                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="tabular-nums">
                        {attempt.score}/{attempt.totalPoints}{" "}
                        <span className="text-muted">({attempt.percentage}%)</span>
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(attempt.submittedAt).toLocaleString()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-4">
              <p className="text-sm text-muted">
                {pagination.total} attempt{pagination.total === 1 ? "" : "s"} — page{" "}
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
