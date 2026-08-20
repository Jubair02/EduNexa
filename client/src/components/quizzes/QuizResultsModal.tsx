import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { quizzesService } from "@/services/quizzes.service";
import type {
  AttemptListParams,
  AttemptWithStudent,
  Pagination,
  Quiz,
  QuizResultsSummary,
} from "@/types";

/** Attempt log for one quiz — admin and the owning instructor. */
export const QuizResultsModal = ({
  quiz,
  onClose,
}: {
  quiz: Quiz;
  onClose: () => void;
}) => {
  const [params, setParams] = useState<AttemptListParams>({
    page: 1,
    limit: 10,
    search: "",
    passed: "",
  });
  const [attempts, setAttempts] = useState<AttemptWithStudent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<QuizResultsSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await quizzesService.results(quiz.id, params);
      setAttempts(result.attempts);
      setPagination(result.pagination);
      setSummary(result.summary);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [quiz.id, params]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Results — ${quiz.title}`}
      description={`Passing score ${quiz.passingScore}%`}
      className="max-w-3xl"
    >
      {status === "loading" && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {status === "error" && (
        <div className="py-8 text-center">
          <p className="font-medium">Unable to load results.</p>
          <Button variant="outline" className="mt-3" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {status === "ready" && summary && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Attempts", value: summary.totalAttempts },
              { label: "Students", value: summary.studentsAttempted },
              { label: "Passed", value: summary.studentsPassed },
              {
                label: "Average",
                value:
                  summary.averagePercentage === null
                    ? "—"
                    : `${summary.averagePercentage}%`,
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-soft px-3 py-2.5">
                <dt className="text-xs text-muted">{tile.label}</dt>
                <dd className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                  {tile.value}
                </dd>
              </div>
            ))}
          </dl>

          {attempts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No attempts yet. Results appear here once students submit.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Student</th>
                      <th className="py-2 pr-4 font-medium">Score</th>
                      <th className="py-2 pr-4 font-medium">Result</th>
                      <th className="py-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.attemptId} className="border-b border-soft last:border-0">
                        <td className="py-2.5 pr-4">
                          <p className="font-medium">
                            {attempt.student
                              ? `${attempt.student.firstName} ${attempt.student.lastName}`
                              : "Deleted user"}
                          </p>
                          <p className="text-xs text-muted">{attempt.student?.email ?? "—"}</p>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">
                          {attempt.score}/{attempt.totalPoints}{" "}
                          <span className="text-muted">({attempt.percentage}%)</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={attempt.passed ? "success" : "muted"}>
                            {attempt.passed ? "Passed" : "Failed"}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-muted">
                          {new Date(attempt.submittedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards. This lives inside a dialog, so the breakpoint is
                  `sm` — the panel is already narrower than the viewport. */}
              <ul className="space-y-2.5 sm:hidden" aria-label="Quiz attempts">
                {attempts.map((attempt) => (
                  <li key={attempt.attemptId} className="rounded-xl border border-soft p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {attempt.student
                            ? `${attempt.student.firstName} ${attempt.student.lastName}`
                            : "Deleted user"}
                        </p>
                        <p className="text-xs break-all text-muted">
                          {attempt.student?.email ?? "—"}
                        </p>
                      </div>
                      <Badge variant={attempt.passed ? "success" : "muted"}>
                        {attempt.passed ? "Passed" : "Failed"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs">
                      <span className="tabular-nums">
                        {attempt.score}/{attempt.totalPoints} ({attempt.percentage}%)
                      </span>
                      <span className="text-muted">
                        {" "}
                        · {new Date(attempt.submittedAt).toLocaleDateString()}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
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
        </div>
      )}
    </Dialog>
  );
};
