import {
  ArrowRight,
  Award,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Plus,
  Target,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AttentionPanel, type AttentionItem } from "@/components/dashboard/AttentionPanel";
import {
  BreakdownList,
  ShareBar,
  type BreakdownItem,
} from "@/components/dashboard/Breakdown";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DonutChart, type DonutSegment } from "@/components/dashboard/DonutChart";
import {
  StatTile,
  StatTileSkeleton,
  type StatTileProps,
} from "@/components/dashboard/StatTile";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { teachingService } from "@/services/teaching.service";
import { relativeTime } from "@/utils/relativeTime";
import type { TeachingOverview } from "@/types";

/** "1 student" / "4 students" — keeps counts readable inside a sentence. */
const countOf = (value: number, one: string, many: string): string =>
  `${value.toLocaleString()} ${value === 1 ? one : many}`;

/** Panel shell, matching the rhythm the admin dashboard uses. */
const InsightPanel = ({
  title,
  hint,
  action,
  isLoading,
  children,
}: {
  title: string;
  hint: string;
  action?: { label: string; to: string };
  isLoading: boolean;
  children: ReactNode;
}) => (
  <Card className="flex h-full flex-col">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <p className="mt-1 text-sm text-muted">{hint}</p>
        </div>
        {action && (
          <Link
            to={action.to}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {action.label}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </CardHeader>
    <CardContent className="flex-1 pb-6">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </CardContent>
  </Card>
);

const STATUS_VARIANT = {
  published: "success",
  draft: "amber",
  archived: "muted",
} as const;

export const InstructorDashboard = () => {
  const { user } = useAuth();
  const [overview, setOverview] = useState<TeachingOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setStatus("loading");
    try {
      setOverview(await teachingService.overview());
      setUpdatedAt(
        new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isReady = status === "ready" && overview !== null;

  const tiles: StatTileProps[] = overview
    ? [
        {
          label: "Students",
          value: overview.students.total.toLocaleString(),
          caption:
            overview.students.total === 0
              ? "Nobody enrolled yet"
              : `${countOf(overview.students.active, "still learning", "still learning")}`,
          icon: Users,
          accent: "primary",
          to: "/instructor/courses",
        },
        {
          label: "Average Progress",
          value: `${overview.engagement.averageProgress}%`,
          share: overview.engagement.averageProgress,
          caption: "Across everyone currently enrolled",
          icon: TrendingUp,
          accent: "aubergine",
        },
        {
          label: "Completion Rate",
          value: `${overview.engagement.completionRate}%`,
          share: overview.engagement.completionRate,
          caption: countOf(overview.engagement.completions, "student", "students") + " finished",
          icon: Target,
          accent: "success",
        },
        {
          label: "Average Quiz Score",
          value:
            overview.quizzes.averageScore === null
              ? "—"
              : `${overview.quizzes.averageScore}%`,
          share: overview.quizzes.averageScore ?? undefined,
          caption:
            overview.quizzes.attempts === 0
              ? "No quizzes attempted yet"
              : `${countOf(overview.quizzes.attempts, "attempt", "attempts")}, ${overview.quizzes.passRate}% passed`,
          icon: Award,
          accent: "amber",
        },
      ]
    : [];

  const courseItems: BreakdownItem[] = overview
    ? [
        { label: "Published", value: overview.courses.published, color: "bg-success" },
        { label: "Draft", value: overview.courses.draft, color: "bg-amber" },
        { label: "Archived", value: overview.courses.archived, color: "bg-soft" },
      ]
    : [];

  const enrollmentSegments: DonutSegment[] = overview
    ? [
        {
          label: "Learning",
          value: overview.students.active,
          stroke: "var(--color-primary)",
        },
        {
          label: "Completed",
          value: overview.students.completed,
          stroke: "var(--color-success)",
        },
        {
          label: "Cancelled",
          value: overview.students.cancelled,
          stroke: "var(--color-soft)",
        },
      ]
    : [];

  const enrollmentItems: BreakdownItem[] = overview
    ? [
        { label: "Learning", value: overview.students.active, color: "bg-primary" },
        { label: "Completed", value: overview.students.completed, color: "bg-success" },
        { label: "Cancelled", value: overview.students.cancelled, color: "bg-soft" },
      ]
    : [];

  const totalEnrollments = overview
    ? overview.students.active + overview.students.completed + overview.students.cancelled
    : 0;

  // Things worth acting on, in the order an instructor would care about them.
  const attention: AttentionItem[] = [];
  if (overview) {
    if (overview.courses.total === 0) {
      attention.push({
        label: "No courses yet",
        note: "Create your first course to start teaching.",
        icon: BookOpen,
        to: "/instructor/courses/new",
      });
    }
    if (overview.courses.draft > 0) {
      attention.push({
        label: `${countOf(overview.courses.draft, "course", "courses")} still in draft`,
        note: "Students cannot see a course until it is published.",
        icon: BookOpen,
        to: "/instructor/courses",
      });
    }
    const emptyCourses = overview.courseBreakdown.filter(
      (row) => row.publishedLessons === 0 && row.status === "published"
    );
    if (emptyCourses.length > 0) {
      attention.push({
        label: `${countOf(emptyCourses.length, "published course", "published courses")} with no lessons`,
        note: "A published course with no published lessons cannot be completed.",
        icon: ClipboardList,
        to: "/instructor/courses",
      });
    }
    if (overview.quizzes.published === 0 && overview.courses.published > 0) {
      attention.push({
        label: "No quizzes published",
        note: "Quizzes are how completion is graded — add one to a course.",
        icon: ClipboardList,
        to: "/instructor/courses",
      });
    }
    if (
      overview.quizzes.passRate !== null &&
      overview.quizzes.passRate < 50 &&
      overview.quizzes.attempts >= 5
    ) {
      attention.push({
        label: `Only ${overview.quizzes.passRate}% of quiz attempts pass`,
        note: "A low pass rate often means the passing score is set too high.",
        icon: Award,
        to: "/instructor/courses",
      });
    }
  }

  return (
    <div className="space-y-8">
      <DashboardHero
        firstName={user?.firstName ?? "Instructor"}
        eyebrow="Teaching overview"
        subtitle="How your courses and your students are doing."
        actions={
          <>
            <Link to="/instructor/courses/new" className="flex-1 sm:flex-none">
              <Button size="sm" className="h-11 w-full whitespace-nowrap sm:h-9">
                <Plus className="size-4" aria-hidden="true" />
                New course
              </Button>
            </Link>
            <Link to="/instructor/courses" className="flex-1 sm:flex-none">
              <Button
                size="sm"
                variant="ghost"
                className="h-11 w-full border border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20 sm:h-9"
              >
                <BookOpen className="size-4" aria-hidden="true" />
                My courses
              </Button>
            </Link>
          </>
        }
        updatedAt={updatedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void load(true)}
      />

      {status === "error" && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>We couldn&apos;t load your teaching overview.</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Alert>
      )}

      <section aria-labelledby="teaching-stats">
        <h2 id="teaching-stats" className="sr-only">
          Teaching statistics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!isReady
            ? Array.from({ length: 4 }, (_, index) => <StatTileSkeleton key={index} />)
            : tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InsightPanel
          title="Your courses"
          hint="Only published courses are visible to students."
          action={{ label: "Manage", to: "/instructor/courses" }}
          isLoading={!isReady}
        >
          <div className="space-y-4">
            <ShareBar items={courseItems} />
            <BreakdownList items={courseItems} total={overview?.courses.total ?? 0} />
          </div>
        </InsightPanel>

        <InsightPanel
          title="Where your students are"
          hint="Every enrollment across the courses you teach."
          isLoading={!isReady}
        >
          {totalEnrollments === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No enrollments yet. Publish a course so students can join.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <DonutChart
                segments={enrollmentSegments}
                centerValue={totalEnrollments.toLocaleString()}
                centerLabel={totalEnrollments === 1 ? "enrollment" : "enrollments"}
              />
              <div className="min-w-[12rem] flex-1">
                <BreakdownList items={enrollmentItems} total={totalEnrollments} />
              </div>
            </div>
          )}
        </InsightPanel>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Course by course</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Progress is the average across everyone currently enrolled.
              </p>
            </div>
            <Link
              to="/instructor/courses"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              All courses
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          {!isReady && (
            <div className="space-y-3" aria-live="polite">
              <p className="sr-only">Loading your courses…</p>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          )}

          {isReady && overview.courseBreakdown.length === 0 && (
            <div className="py-10 text-center">
              <BookOpen className="mx-auto size-8 text-muted" aria-hidden="true" />
              <p className="mt-3 font-medium">You have no courses yet.</p>
              <p className="mt-1 text-sm text-muted">
                Create one to start building lessons and quizzes.
              </p>
              <Link to="/instructor/courses/new">
                <Button className="mt-4">Create a course</Button>
              </Link>
            </div>
          )}

          {isReady && overview.courseBreakdown.length > 0 && (
            <>
              {/* Table on wide screens… */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-soft text-xs text-muted uppercase">
                      <th className="py-2 pr-4 font-medium">Course</th>
                      <th className="py-2 pr-4 font-medium">Students</th>
                      <th className="py-2 pr-4 font-medium">Avg. progress</th>
                      <th className="py-2 pr-4 font-medium">Completed</th>
                      <th className="py-2 font-medium">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.courseBreakdown.map((row) => (
                      <tr key={row.courseId} className="border-b border-soft last:border-0">
                        <td className="py-3 pr-4">
                          <Link
                            to={`/instructor/courses/${row.courseId}`}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            {row.title}
                          </Link>
                          <div className="mt-1">
                            <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                          </div>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{row.students}</td>
                        <td className="py-3 pr-4">
                          <div className="min-w-[8rem]">
                            <Progress
                              value={row.averageProgress}
                              label={`${row.averageProgress}%`}
                            />
                          </div>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {row.completions}
                          <span className="text-muted"> ({row.completionRate}%)</span>
                        </td>
                        <td className="py-3 text-muted">
                          {row.publishedLessons} lesson
                          {row.publishedLessons === 1 ? "" : "s"} ·{" "}
                          {row.requiredQuizzes} required quiz
                          {row.requiredQuizzes === 1 ? "" : "zes"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* …cards on phones, so nothing has to be dragged sideways. */}
              <ul className="space-y-3 md:hidden">
                {overview.courseBreakdown.map((row) => (
                  <li key={row.courseId} className="rounded-xl border border-soft p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        to={`/instructor/courses/${row.courseId}`}
                        className="font-medium transition-colors hover:text-primary"
                      >
                        {row.title}
                      </Link>
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    </div>
                    <div className="mt-3">
                      <Progress
                        value={row.averageProgress}
                        label={`${row.averageProgress}% average progress`}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {countOf(row.students, "student", "students")} ·{" "}
                      {row.completions} completed ({row.completionRate}%) ·{" "}
                      {row.publishedLessons} lesson
                      {row.publishedLessons === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle className="text-lg">Students who could use a nudge</CardTitle>
            <p className="mt-1 text-sm text-muted">
              Still enrolled, least far along, and signed up more than a week ago.
            </p>
          </CardHeader>
          <CardContent className="flex-1 pb-6">
            {!isReady && (
              <div className="space-y-3">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            )}

            {isReady && overview.nudges.length === 0 && (
              <div className="py-8 text-center">
                <GraduationCap className="mx-auto size-8 text-muted" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">Nobody is falling behind.</p>
                <p className="mt-1 text-sm text-muted">
                  Everyone enrolled is either making progress or has finished.
                </p>
              </div>
            )}

            {isReady && overview.nudges.length > 0 && (
              <ul
                className="divide-y divide-soft"
                aria-label="Students who could use a nudge"
              >
                {overview.nudges.map((nudge) => (
                  <li
                    key={nudge.enrollmentId}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <UserRound className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{nudge.studentName}</p>
                      <p className="truncate text-xs text-muted">
                        {nudge.courseTitle} ·{" "}
                        {nudge.lastAccessedAt
                          ? `last active ${relativeTime(nudge.lastAccessedAt)}`
                          : "never opened the course"}
                      </p>
                    </div>
                    <span className="font-display text-lg font-semibold tabular-nums">
                      {nudge.progressPercentage}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <AttentionPanel
          items={attention}
          isLoading={!isReady}
          emptyNote="Nothing unpublished or unfinished across your courses."
        />
      </div>
    </div>
  );
};
