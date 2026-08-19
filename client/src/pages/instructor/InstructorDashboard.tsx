import { Archive, BookOpen, FileEdit, Rocket } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { coursesService } from "@/services/courses.service";
import type { CourseStatistics } from "@/types";

interface KpiCard {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const kpiCards = (stats: CourseStatistics): KpiCard[] => [
  { label: "My Courses", value: stats.totalCourses, icon: BookOpen },
  { label: "Published Courses", value: stats.published, icon: Rocket },
  { label: "Draft Courses", value: stats.draft, icon: FileEdit },
  { label: "Archived Courses", value: stats.archived, icon: Archive },
];

export const InstructorDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<CourseStatistics | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setStats(await coursesService.statistics());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            Welcome, {user?.firstName ?? "Instructor"}
          </h1>
          <p className="mt-1 text-muted">An overview of the courses you teach.</p>
        </div>
        <Link to="/instructor/courses">
          <Button variant="outline">My courses</Button>
        </Link>
      </div>

      {status === "error" && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center gap-3">
            <span>Unable to load your course statistics. Please try again.</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      <section aria-label="Course statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {status === "loading" &&
            Array.from({ length: 4 }, (_, i) => (
              <Card key={i}>
                <CardContent className="py-6">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-9 w-16" />
                </CardContent>
              </Card>
            ))}

          {status === "ready" &&
            stats &&
            kpiCards(stats).map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between py-6">
                  <div>
                    <p className="text-sm text-muted">{label}</p>
                    <p className="mt-1 font-display text-3xl font-semibold">
                      {value.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary-soft p-3">
                    <Icon className="size-6 text-primary" aria-hidden={true} />
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>

      {status === "ready" && stats?.totalCourses === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">You haven't created any courses yet.</p>
            <p className="mt-1 text-sm text-muted">
              Your first course is a few fields away — it stays a draft until you publish.
            </p>
            <Link to="/instructor/courses/new">
              <Button className="mt-4">Create your first course</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
