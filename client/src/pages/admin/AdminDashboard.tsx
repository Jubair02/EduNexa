import {
  ArrowRight,
  BookOpen,
  FileEdit,
  GraduationCap,
  Target,
  UserX,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AttentionPanel, type AttentionItem } from "@/components/admin/AttentionPanel";
import { BreakdownList, ShareBar, type BreakdownItem } from "@/components/admin/Breakdown";
import { DashboardHero } from "@/components/admin/DashboardHero";
import { DonutChart, type DonutSegment } from "@/components/admin/DonutChart";
import { RecentUsersPanel } from "@/components/admin/RecentUsersPanel";
import {
  StatTile,
  StatTileSkeleton,
  type StatTileProps,
} from "@/components/dashboard/StatTile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { usersService } from "@/services/users.service";
import type {
  CourseStatistics,
  EnrollmentStatistics,
  User,
  UserStatistics,
} from "@/types";

const share = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** "1 course" / "4 courses" — keeps counts readable inside a sentence. */
const countOf = (value: number, one: string, many: string): string =>
  `${value.toLocaleString()} ${value === 1 ? one : many}`;

/** Panel shell so every insight card keeps the same header rhythm. */
const InsightPanel = ({
  title,
  hint,
  action,
  isLoading,
  children,
}: {
  title: string;
  hint: string;
  action: { label: string; to: string };
  isLoading: boolean;
  children: ReactNode;
}) => (
  <Card className="flex h-full flex-col">
    <CardHeader>
      <CardTitle className="text-lg">{title}</CardTitle>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col justify-between gap-5 pb-6">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-2.5 w-full" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <>
          {children}
          <Link
            to={action.to}
            className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {action.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      )}
    </CardContent>
  </Card>
);

export const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [courseStats, setCourseStats] = useState<CourseStatistics | null>(null);
  const [enrollmentStats, setEnrollmentStats] = useState<EnrollmentStatistics | null>(
    null
  );
  const [recent, setRecent] = useState<User[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [statistics, courseStatistics, enrollmentStatistics, recentUsers] =
        await Promise.all([
          usersService.statistics(),
          coursesService.statistics(),
          enrollmentsService.statistics(),
          usersService.recent(),
        ]);
      setStats(statistics);
      setCourseStats(courseStatistics);
      setEnrollmentStats(enrollmentStatistics);
      setRecent(recentUsers);
      setUpdatedAt(
        new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isReady = status === "ready";

  const roleItems: BreakdownItem[] = stats
    ? [
        { label: "Students", value: stats.students, color: "bg-primary" },
        { label: "Instructors", value: stats.instructors, color: "bg-aubergine" },
        { label: "Admins", value: stats.admins, color: "bg-amber" },
      ]
    : [];

  const courseItems: BreakdownItem[] = courseStats
    ? [
        { label: "Published Courses", value: courseStats.published, color: "bg-success" },
        { label: "Draft Courses", value: courseStats.draft, color: "bg-amber" },
        { label: "Archived Courses", value: courseStats.archived, color: "bg-muted" },
      ]
    : [];

  const enrollmentItems: BreakdownItem[] = enrollmentStats
    ? [
        {
          label: "Active Enrollments",
          value: enrollmentStats.activeEnrollments,
          color: "bg-primary",
        },
        {
          label: "Completed Enrollments",
          value: enrollmentStats.completedEnrollments,
          color: "bg-success",
        },
        {
          // Muted, not danger: cancelling is a normal outcome, and it matches the
          // badge colour used for cancelled enrollments elsewhere in the app.
          label: "Cancelled Enrollments",
          value: enrollmentStats.cancelledEnrollments,
          color: "bg-muted",
        },
      ]
    : [];

  // Stroke classes are written out in full — Tailwind only emits utilities it can
  // find as literal strings in the source.
  const enrollmentStrokes = ["stroke-primary", "stroke-success", "stroke-muted"];
  const enrollmentSegments: DonutSegment[] = enrollmentItems.map((item, index) => ({
    label: item.label,
    value: item.value,
    stroke: enrollmentStrokes[index] ?? "stroke-primary",
  }));

  const hiddenCourses = courseStats ? courseStats.draft + courseStats.archived : 0;

  const completionRate = enrollmentStats
    ? share(enrollmentStats.completedEnrollments, enrollmentStats.totalEnrollments)
    : 0;

  const tiles: StatTileProps[] = [];
  if (stats) {
    const activeShare = share(stats.activeUsers, stats.totalUsers);
    tiles.push({
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      share: activeShare,
      caption: `${activeShare}% of accounts are active`,
      icon: Users,
      accent: "primary",
      to: "/admin/users",
    });
  }
  if (courseStats) {
    const publishedShare = share(courseStats.published, courseStats.totalCourses);
    tiles.push({
      label: "Total Courses",
      value: courseStats.totalCourses.toLocaleString(),
      share: publishedShare,
      caption: `${publishedShare}% live in the catalog`,
      icon: BookOpen,
      accent: "aubergine",
      to: "/admin/courses",
    });
  }
  if (enrollmentStats) {
    const activeShare = share(
      enrollmentStats.activeEnrollments,
      enrollmentStats.totalEnrollments
    );
    tiles.push(
      {
        label: "Total Enrollments",
        value: enrollmentStats.totalEnrollments.toLocaleString(),
        share: activeShare,
        caption: `${activeShare}% still in progress`,
        icon: GraduationCap,
        accent: "primary",
        to: "/admin/enrollments",
      },
      {
        label: "Completion Rate",
        value: `${completionRate}%`,
        share: completionRate,
        caption: `${countOf(
          enrollmentStats.completedEnrollments,
          "learner",
          "learners"
        )} finished a course`,
        icon: Target,
        accent: "success",
      }
    );
  }

  const attention: AttentionItem[] = [];
  if (stats && stats.inactiveUsers > 0) {
    attention.push({
      label: "Deactivated accounts",
      note: `${countOf(stats.inactiveUsers, "account", "accounts")} cannot sign in`,
      icon: UserX,
      to: "/admin/users",
    });
  }
  if (courseStats && courseStats.draft > 0) {
    attention.push({
      label: "Courses awaiting publish",
      note: `${countOf(courseStats.draft, "course", "courses")} still in draft`,
      icon: FileEdit,
      to: "/admin/courses",
    });
  }
  if (enrollmentStats && enrollmentStats.cancelledEnrollments > 0) {
    attention.push({
      label: "Dropped enrollments",
      note: `${countOf(
        enrollmentStats.cancelledEnrollments,
        "learner",
        "learners"
      )} left a course`,
      icon: XCircle,
      to: "/admin/enrollments",
    });
  }

  return (
    <div className="space-y-5">
      <DashboardHero
        firstName={user?.firstName ?? "Admin"}
        updatedAt={updatedAt}
        isRefreshing={status === "loading"}
        onRefresh={() => void load()}
      />

      {status === "error" && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>Unable to load dashboard data. Please try again.</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      <section aria-label="Platform totals">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {!isReady &&
            Array.from({ length: 4 }, (_, index) => <StatTileSkeleton key={index} />)}

          {isReady &&
            tiles.map((tile, index) => (
              <div
                key={tile.label}
                className="animate-rise-in h-full"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <StatTile {...tile} />
              </div>
            ))}
        </div>
      </section>

      <section
        aria-label="Breakdowns"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <InsightPanel
          title="User roles"
          hint="How the community is made up."
          action={{ label: "Manage users", to: "/admin/users" }}
          isLoading={!isReady}
        >
          <div className="space-y-4">
            <ShareBar items={roleItems} />
            <BreakdownList items={roleItems} total={stats?.totalUsers ?? 0} />
            <div className="grid grid-cols-2 gap-3 border-t border-soft pt-4">
              <div>
                <p className="text-xs text-muted">Active users</p>
                <p className="mt-0.5 font-display text-xl font-semibold text-success tabular-nums">
                  {(stats?.activeUsers ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Inactive users</p>
                <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">
                  {(stats?.inactiveUsers ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </InsightPanel>

        <InsightPanel
          title="Course pipeline"
          hint="From first draft to published."
          action={{ label: "Manage courses", to: "/admin/courses" }}
          isLoading={!isReady}
        >
          <div className="space-y-4">
            <BreakdownList
              items={courseItems}
              total={courseStats?.totalCourses ?? 0}
              showBars={true}
            />
            <div className="border-t border-soft pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs text-muted">Hidden from learners</p>
                <p className="font-display text-xl font-semibold tabular-nums">
                  {hiddenCourses.toLocaleString()}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                Drafts and archived courses never reach the catalog.
              </p>
            </div>
          </div>
        </InsightPanel>

        {/* Full width on the two-column layout so the ring sits beside its legend. */}
        <div className="sm:col-span-2 lg:col-span-1">
          <InsightPanel
            title="Enrollment health"
            hint="Where learners stand right now."
            action={{ label: "View enrollments", to: "/admin/enrollments" }}
            isLoading={!isReady}
          >
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8 lg:flex-col">
              <DonutChart
                segments={enrollmentSegments}
                centerValue={(enrollmentStats?.totalEnrollments ?? 0).toLocaleString()}
                centerLabel="Total"
              />
              <div className="w-full">
                <BreakdownList
                  items={enrollmentItems}
                  total={enrollmentStats?.totalEnrollments ?? 0}
                />
              </div>
            </div>
          </InsightPanel>
        </div>
      </section>

      <section
        aria-label="Recent activity"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          <RecentUsersPanel users={recent} isLoading={!isReady} />
        </div>
        <AttentionPanel items={attention} isLoading={!isReady} />
      </section>
    </div>
  );
};
