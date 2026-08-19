import {
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  PlayCircle,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatTile, StatTileSkeleton, type StatTileProps } from "@/components/dashboard/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { progressService } from "@/services/progress.service";
import type { MyCourseProgress, ProgressSummary } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

/** One screen for everything the student has finished and has left to do. */
export const StudentProgressPage = () => {
  const [courses, setCourses] = useState<MyCourseProgress[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await progressService.myCourses();
      setCourses(result.courses);
      setSummary(result.summary);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tiles: StatTileProps[] = summary
    ? [
        {
          label: "Courses In Progress",
          value: summary.activeCourses.toLocaleString(),
          caption: "Enrolled and still going",
          icon: BookOpen,
          accent: "primary",
        },
        {
          label: "Completed Courses",
          value: summary.completedCourses.toLocaleString(),
          caption: "Every requirement met",
          icon: CheckCircle2,
          accent: "success",
        },
        {
          label: "Overall Progress",
          value: `${summary.overallProgressPercentage}%`,
          share: summary.overallProgressPercentage,
          caption: "Across every enrolled course",
          icon: TrendingUp,
          accent: "aubergine",
        },
        {
          label: "Average Quiz Score",
          value:
            summary.averageQuizScore === null ? "—" : `${summary.averageQuizScore}%`,
          share: summary.averageQuizScore ?? undefined,
          caption:
            summary.quizzesAttempted === 0
              ? "No quizzes attempted yet"
              : `Best attempt across ${summary.quizzesAttempted} quiz${summary.quizzesAttempted === 1 ? "" : "zes"}`,
          icon: Award,
          accent: "amber",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My progress</h1>
          <p className="mt-1 text-muted">
            Where you stand in every course you're enrolled in.
          </p>
        </div>
        <Link to="/student/courses">
          <Button variant="outline">My courses</Button>
        </Link>
      </div>

      <section aria-labelledby="progress-stats">
        <h2 id="progress-stats" className="sr-only">
          Progress statistics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {status === "loading"
            ? Array.from({ length: 4 }, (_, index) => <StatTileSkeleton key={index} />)
            : tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Course by course</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-6">
          {status === "loading" && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading progress…</p>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          )}

          {status === "error" && (
            <div className="py-10 text-center">
              <p className="font-medium">Unable to load your progress.</p>
              <p className="mt-1 text-sm text-muted">Please try again.</p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && courses.length === 0 && (
            <div className="py-10 text-center">
              <p className="font-medium">You haven't enrolled in any courses yet.</p>
              <p className="mt-1 text-sm text-muted">
                Progress appears here once you start learning.
              </p>
              <Link to="/courses">
                <Button className="mt-4">
                  <Compass className="size-4" aria-hidden="true" />
                  Browse Courses
                </Button>
              </Link>
            </div>
          )}

          {status === "ready" &&
            courses.map(({ course, progress, enrollmentStatus }) => (
              <div
                key={course.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-soft p-4"
              >
                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">
                      <Link
                        to={`/courses/${course.slug}`}
                        className="transition-colors hover:text-primary"
                      >
                        {course.title}
                      </Link>
                    </h3>
                    {progress.isCompleted && <Badge variant="success">Completed</Badge>}
                    {enrollmentStatus === "cancelled" && (
                      <Badge variant="muted">Cancelled</Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <Progress
                      value={progress.progressPercentage}
                      label={`${progress.completedLessons}/${progress.totalLessons} lessons · ${progress.passedRequiredQuizzes}/${progress.totalRequiredQuizzes} required quizzes`}
                    />
                  </div>
                </div>

                <p className="font-display text-2xl font-semibold tabular-nums">
                  {progress.progressPercentage}%
                </p>

                <div className="flex flex-wrap gap-2">
                  {progress.certificateAvailable && (
                    <Link to="/student/certificates">
                      <Button variant="outline" size="sm">
                        <Award className="size-4" aria-hidden="true" />
                        Certificate
                      </Button>
                    </Link>
                  )}
                  <Link to={`/student/courses/${course.id}/learn`}>
                    <Button size="sm">
                      <PlayCircle className="size-4" aria-hidden="true" />
                      {progress.isCompleted ? "Review" : "Continue"}
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
};
