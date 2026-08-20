import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  PlayCircle,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CertificateCard } from "@/components/certificates/CertificateCard";
import { CourseCard } from "@/components/CourseCard";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { StatTile, StatTileSkeleton, type StatTileProps } from "@/components/dashboard/StatTile";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { progressService } from "@/services/progress.service";
import type { Certificate, Course, Enrollment, ProgressSummary } from "@/types";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

type ActivityKind = "enrolled" | "opened" | "cancelled";

interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  courseTitle: string;
}

const activityMeta: Record<
  ActivityKind,
  { icon: typeof GraduationCap; chip: string; verb: string }
> = {
  enrolled: {
    icon: GraduationCap,
    chip: "bg-primary-soft text-primary-strong",
    verb: "Enrolled in",
  },
  opened: { icon: PlayCircle, chip: "bg-success-soft text-success", verb: "Opened" },
  cancelled: { icon: XCircle, chip: "bg-soft text-muted", verb: "Cancelled" },
};

const today = (): string =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const lastTouched = (enrollment: Enrollment): number =>
  new Date(enrollment.lastAccessedAt ?? enrollment.enrolledAt).getTime();

const buildActivity = (enrollments: Enrollment[]): ActivityEvent[] => {
  const events: ActivityEvent[] = [];

  for (const enrollment of enrollments) {
    const courseTitle = enrollment.course?.title ?? "a course";
    events.push({
      id: `${enrollment.id}-enrolled`,
      kind: "enrolled",
      at: enrollment.enrolledAt,
      courseTitle,
    });
    if (enrollment.lastAccessedAt) {
      events.push({
        id: `${enrollment.id}-opened`,
        kind: "opened",
        at: enrollment.lastAccessedAt,
        courseTitle,
      });
    }
    if (enrollment.status === "cancelled") {
      events.push({
        id: `${enrollment.id}-cancelled`,
        kind: "cancelled",
        at: enrollment.updatedAt,
        courseTitle,
      });
    }
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
};

/** One in-progress course with its real completion share. */
const ContinueCard = ({
  enrollment,
  progressPercentage,
}: {
  enrollment: Enrollment;
  progressPercentage: number | null;
}) => {
  const course = enrollment.course;
  if (!course) return null;

  return (
    <div className="flex gap-4 rounded-xl border border-soft bg-surface p-3 transition-colors duration-200 hover:border-primary/30">
      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg">
        <CourseThumbnail course={{ title: course.title, thumbnail: course.thumbnail }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            <Link
              to={`/courses/${course.slug}`}
              className="transition-colors hover:text-primary"
            >
              {course.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {course.instructorName}
            {enrollment.lastAccessedAt && (
              <> · opened {relativeTime(enrollment.lastAccessedAt)}</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <Progress
            value={progressPercentage}
            label={
              progressPercentage === null
                ? "Progress unavailable"
                : `${progressPercentage}% complete`
            }
            className="min-w-[8rem] flex-1"
          />
          <Link to={`/student/courses/${course.id}/learn`}>
            <Button size="sm">
              <PlayCircle className="size-4" aria-hidden="true" />
              Continue
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export const StudentDashboard = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [progressByCourse, setProgressByCourse] = useState<Record<string, number>>({});
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [recommended, setRecommended] = useState<Course[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setStatus("loading");
    }

    // All four run in parallel, but only progress and enrollments are load
    // bearing — a failing recommendation or certificate call hides its own
    // panel instead of blanking the dashboard.
    const [progressResult, enrollmentResult, catalogResult, certificateResult] =
      await Promise.allSettled([
        progressService.myCourses(),
        enrollmentsService.myCourses({
          page: 1,
          limit: 20,
          search: "",
          status: "",
          // The server's existing default, now stated rather than assumed.
          sortBy: "enrolledAt",
          sortOrder: "desc",
        }),
        coursesService.list({
          page: 1,
          limit: 9,
          search: "",
          category: "",
          level: "",
          status: "",
          view: "catalog",
        }),
        certificatesService.list({ page: 1, limit: 3, search: "", status: "" }),
      ]);

    setIsRefreshing(false);

    if (progressResult.status === "rejected" || enrollmentResult.status === "rejected") {
      setStatus("error");
      return;
    }

    const progressData = progressResult.value;
    const mine = enrollmentResult.value;
    const enrolledCourseIds = new Set(
      mine.enrollments.map((enrollment) => enrollment.course?.id).filter(Boolean)
    );

    setSummary(progressData.summary);
    setProgressByCourse(
      Object.fromEntries(
        progressData.courses.map((entry) => [
          entry.course.id,
          entry.progress.progressPercentage,
        ])
      )
    );
    setEnrollments(mine.enrollments);
    setRecommended(
      catalogResult.status === "fulfilled"
        ? catalogResult.value.courses
            .filter((course) => !enrolledCourseIds.has(course.id))
            .slice(0, 3)
        : []
    );
    setCertificates(
      certificateResult.status === "fulfilled" ? certificateResult.value.certificates : []
    );
    setCertificateCount(
      certificateResult.status === "fulfilled"
        ? certificateResult.value.pagination.total
        : 0
    );
    setStatus("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isLoading = status === "loading";
  const activeEnrollments = enrollments
    .filter((enrollment) => enrollment.status === "active")
    .sort((a, b) => lastTouched(b) - lastTouched(a));
  const continueList = activeEnrollments.slice(0, 3);
  const activity = buildActivity(enrollments);
  const resumeTarget = continueList[0]?.course;

  const tiles: StatTileProps[] = summary
    ? [
        {
          label: "Active Courses",
          value: summary.activeCourses.toLocaleString(),
          caption: "Courses you can open today",
          icon: BookOpen,
          accent: "primary",
          to: "/student/courses",
        },
        {
          label: "Completed Courses",
          value: summary.completedCourses.toLocaleString(),
          caption: "All lessons and required quizzes done",
          icon: CheckCircle2,
          accent: "success",
        },
        {
          label: "Certificates",
          value: certificateCount.toLocaleString(),
          caption:
            certificateCount === 0
              ? "Complete a course to earn one"
              : "Earned and ready to download",
          icon: Award,
          accent: "amber",
          to: "/student/certificates",
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
    <div className="space-y-8">
      {/* Hero */}
      <section className="animate-rise-in relative overflow-hidden rounded-2xl bg-aubergine px-5 py-6 text-white sm:px-8 sm:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary/30 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold tracking-wide text-white/60 uppercase">
              <span>My learning</span>
              <span aria-hidden="true">•</span>
              <span className="normal-case">{today()}</span>
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
              Welcome back, {user?.firstName ?? "learner"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">
              {resumeTarget
                ? `Pick up where you left off in ${resumeTarget.title}.`
                : "Find a course that fits and start learning today."}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {resumeTarget ? (
                <Link
                  to={`/student/courses/${resumeTarget.id}/learn`}
                  className="flex-1 sm:flex-none"
                >
                  <Button size="sm" className="h-11 w-full whitespace-nowrap sm:h-9">
                    <PlayCircle className="size-4" aria-hidden="true" />
                    Continue learning
                  </Button>
                </Link>
              ) : (
                <Link to="/courses" className="flex-1 sm:flex-none">
                  <Button size="sm" className="h-11 w-full whitespace-nowrap sm:h-9">
                    <Compass className="size-4" aria-hidden="true" />
                    Browse courses
                  </Button>
                </Link>
              )}
              <Link to="/student/courses" className="flex-1 sm:flex-none">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 w-full border border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20 sm:h-9"
                >
                  <BookOpen className="size-4" aria-hidden="true" />
                  My courses
                </Button>
              </Link>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => void load(true)}
              disabled={isRefreshing}
              className="h-9 self-start px-2 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-100 sm:self-end"
            >
              <RefreshCw
                className={cn("size-4", isRefreshing && "animate-spin")}
                aria-hidden="true"
              />
              {isRefreshing ? "Updating…" : "Refresh"}
            </Button>
          </div>
        </div>
      </section>

      {status === "error" && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>Unable to load your dashboard. Please try again.</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Learning statistics */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Learning statistics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {isLoading
            ? Array.from({ length: 5 }, (_, index) => <StatTileSkeleton key={index} />)
            : tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
        </div>
      </section>

      {/* Certificates earned */}
      {!isLoading && certificates.length > 0 && (
        <section aria-labelledby="certificates-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="certificates-heading" className="font-display text-xl font-semibold">
              Recent certificates
            </h2>
            <Link
              to="/student/certificates"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              All certificates
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {certificates.map((certificate) => (
              <CertificateCard key={certificate.id} certificate={certificate} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Continue learning */}
        <section aria-labelledby="continue-heading" className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle id="continue-heading" className="text-lg">
                Continue Learning
              </CardTitle>
              <Link
                to="/student/courses"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                All my courses
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3 pb-6">
              {isLoading &&
                Array.from({ length: 2 }, (_, index) => (
                  <Skeleton key={index} className="h-24 w-full rounded-xl" />
                ))}

              {!isLoading && continueList.length === 0 && (
                <div className="py-8 text-center">
                  <p className="font-medium">You haven't enrolled in any courses yet.</p>
                  <p className="mt-1 text-sm text-muted">
                    Browse the catalog and enroll to start learning.
                  </p>
                  <Link to="/courses">
                    <Button className="mt-4">
                      <Compass className="size-4" aria-hidden="true" />
                      Browse Courses
                    </Button>
                  </Link>
                </div>
              )}

              {!isLoading &&
                continueList.map((enrollment) => (
                  <ContinueCard
                    key={enrollment.id}
                    enrollment={enrollment}
                    progressPercentage={
                      enrollment.course
                        ? (progressByCourse[enrollment.course.id] ?? null)
                        : null
                    }
                  />
                ))}
            </CardContent>
          </Card>
        </section>

        {/* Recent activity */}
        <section aria-labelledby="activity-heading">
          <Card className="h-full">
            <CardHeader>
              <CardTitle id="activity-heading" className="text-lg">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              {isLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              )}

              {!isLoading && activity.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">
                  Your enrollments and lessons will show up here.
                </p>
              )}

              {!isLoading && activity.length > 0 && (
                <ul className="space-y-3">
                  {activity.map((event) => {
                    const { icon: Icon, chip, verb } = activityMeta[event.kind];
                    return (
                      <li key={event.id} className="flex items-start gap-3">
                        <span className={cn("mt-0.5 shrink-0 rounded-lg p-1.5", chip)}>
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug">
                            {verb} <span className="font-medium">{event.courseTitle}</span>
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Clock className="size-3" aria-hidden="true" />
                            {relativeTime(event.at)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Recommendations */}
      {!isLoading && recommended.length > 0 && (
        <section aria-labelledby="recommended-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="recommended-heading" className="font-display text-xl font-semibold">
              Recommended Courses
            </h2>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Browse all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((course) => (
              <CourseCard key={course.id} course={course} to={`/courses/${course.slug}`} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
