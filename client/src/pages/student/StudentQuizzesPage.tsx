import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  Play,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { quizzesService } from "@/services/quizzes.service";
import type { Pagination, StudentQuizOverview } from "@/types";

type LoadStatus = "loading" | "error" | "ready";
type Filter = "all" | "outstanding" | "passed";

/** Every quiz across the student's courses, grouped by course. */
export const StudentQuizzesPage = () => {
  const [quizzes, setQuizzes] = useState<StudentQuizOverview[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await quizzesService.myQuizzes({ page, limit: 20 });
      setQuizzes(result.quizzes);
      setPagination(result.pagination);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  // The list is small (a student's own courses), so filtering stays local.
  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = quizzes.filter((quiz) => {
      if (filter === "passed" && !quiz.passed) return false;
      if (filter === "outstanding" && quiz.passed) return false;
      if (!term) return true;
      return (
        quiz.title.toLowerCase().includes(term) ||
        quiz.courseTitle.toLowerCase().includes(term)
      );
    });

    const byCourse = new Map<string, { title: string; quizzes: StudentQuizOverview[] }>();
    for (const quiz of visible) {
      const entry = byCourse.get(quiz.courseId) ?? {
        title: quiz.courseTitle,
        quizzes: [],
      };
      entry.quizzes.push(quiz);
      byCourse.set(quiz.courseId, entry);
    }
    return [...byCourse.entries()];
  }, [quizzes, search, filter]);

  const passedCount = quizzes.filter((quiz) => quiz.passed).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Quizzes</h1>
          <p className="mt-1 text-muted">
            {status === "ready" && quizzes.length > 0
              ? // `passedCount` only covers the loaded page, so say so when there
                // is more than one — otherwise the plain phrasing is accurate.
                pagination && pagination.totalPages > 1
                ? `${passedCount} of ${quizzes.length} passed on this page.`
                : `${passedCount} of ${quizzes.length} passed across your courses.`
              : "Quizzes from every course you're enrolled in."}
          </p>
        </div>
        <Link to="/student/progress">
          <Button variant="outline">My progress</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_200px]">
        <Input
          type="search"
          aria-label="Search quizzes"
          placeholder="Search by quiz or course…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          aria-label="Filter quizzes"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          <option value="all">All quizzes</option>
          <option value="outstanding">Not passed yet</option>
          <option value="passed">Passed</option>
        </Select>
      </div>

      {status === "loading" && (
        <div className="space-y-3" aria-live="polite">
          <p className="sr-only">Loading quizzes…</p>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Unable to load your quizzes.</p>
            <p className="mt-1 text-sm text-muted">Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && quizzes.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center">
            <ClipboardList className="mx-auto size-9 text-muted" aria-hidden="true" />
            <p className="mt-3 font-medium">No quizzes available yet.</p>
            <p className="mt-1 text-sm text-muted">
              Quizzes appear here when a course you're enrolled in publishes one.
            </p>
            <Link to="/courses">
              <Button className="mt-4">
                <Compass className="size-4" aria-hidden="true" />
                Browse Courses
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "ready" && quizzes.length > 0 && grouped.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No quizzes match your search or filter.</p>
          </CardContent>
        </Card>
      )}

      {status === "ready" &&
        grouped.map(([courseId, group]) => (
          <Card key={courseId}>
            <CardHeader>
              <CardTitle className="text-lg">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <ul className="divide-y divide-soft">
                {group.quizzes.map((quiz) => (
                  <li
                    key={quiz.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {quiz.passed ? (
                          <CheckCircle2
                            className="size-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                        ) : (
                          <ClipboardList
                            className="size-4 shrink-0 text-muted"
                            aria-hidden="true"
                          />
                        )}
                        <p className="truncate font-medium">{quiz.title}</p>
                        {quiz.passed && <Badge variant="success">Passed</Badge>}
                        {quiz.isRequired && !quiz.passed && (
                          <Badge variant="primary">Required</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {quiz.questionCount} question
                        {quiz.questionCount === 1 ? "" : "s"} · pass at{" "}
                        {quiz.passingScore}% ·{" "}
                        {quiz.attemptCount === 0
                          ? "not attempted"
                          : `${quiz.attemptCount} attempt${quiz.attemptCount === 1 ? "" : "s"}, best ${quiz.bestPercentage}%`}
                      </p>
                    </div>

                    <Link to={`/student/courses/${quiz.courseId}/quizzes/${quiz.id}`}>
                      <Button size="sm" variant={quiz.passed ? "outline" : "primary"}>
                        {quiz.attemptCount === 0 ? (
                          <>
                            <Play className="size-4" aria-hidden="true" />
                            Start quiz
                          </>
                        ) : (
                          <>
                            <RotateCcw className="size-4" aria-hidden="true" />
                            {quiz.passed ? "Retake" : "Try again"}
                          </>
                        )}
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

      {status === "ready" && pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-soft bg-surface px-5 py-4">
          <p className="text-sm text-muted">
            {pagination.total} quiz{pagination.total === 1 ? "" : "zes"} — page{" "}
            {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
