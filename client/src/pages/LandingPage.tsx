import {
  Award,
  BadgeCheck,
  BookOpen,
  ClipboardCheck,
  Compass,
  GraduationCap,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CourseCard } from "@/components/CourseCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesService } from "@/services/courses.service";
import type { Course } from "@/types";

interface Feature {
  title: string;
  body: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const FEATURES: Feature[] = [
  {
    title: "Courses built in modules",
    body: "Video, written, PDF and document lessons, grouped into modules and released when they are ready.",
    icon: BookOpen,
  },
  {
    title: "Progress you can see",
    body: "Every lesson you finish and every quiz you pass moves a real number, worked out on the server.",
    icon: TrendingUp,
  },
  {
    title: "Quizzes that mark themselves",
    body: "Marked against the answer key the moment you submit. Retake as often as you like — your best attempt counts.",
    icon: ClipboardCheck,
  },
  {
    title: "Certificates that verify",
    body: "Finish everything and a certificate is issued automatically, with a code anyone can check.",
    icon: Award,
  },
];

/**
 * The front door for anyone who is not signed in. Signed-in visitors never see
 * it — the root route sends them to their own dashboard instead.
 */
export const LandingPage = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [code, setCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    coursesService
      .list({
        page: 1,
        limit: 3,
        search: "",
        category: "",
        level: "",
        status: "",
        view: "catalog",
      })
      .then((result) => {
        if (!cancelled) setCourses(result.courses);
      })
      .catch(() => {
        // The catalogue preview is a nicety; the page stands without it.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const verify = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    void navigate(`/verify/certificate/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-aubergine px-6 py-12 text-white sm:px-10 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-primary/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -bottom-32 size-64 rounded-full bg-amber/10 blur-3xl"
        />

        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">
            EduNexa — by Tulip Tech
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight font-semibold sm:text-5xl">
            Teaching grows things.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75 sm:text-lg">
            One place for your courses, your classes and your progress — for
            administrators, instructors and students alike.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/courses">
              <Button className="whitespace-nowrap">
                <Compass className="size-4" aria-hidden="true" />
                Browse courses
              </Button>
            </Link>
            <Link to="/register">
              <Button
                variant="ghost"
                className="border border-white/25 bg-white/10 whitespace-nowrap text-white hover:bg-white/20"
              >
                Create an account
              </Button>
            </Link>
          </div>

          <p className="mt-4 text-sm text-white/60">
            Already have one?{" "}
            <Link to="/login" className="font-medium text-white underline">
              Sign in
            </Link>
            .
          </p>
        </div>
      </section>

      {/* What it does */}
      <section aria-labelledby="features-heading">
        <h2 id="features-heading" className="font-display text-2xl font-semibold">
          What you get
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ title, body, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="flex gap-4 py-5">
                <span className="shrink-0 rounded-xl bg-primary-soft p-2.5">
                  <Icon className="size-5 text-primary" aria-hidden={true} />
                </span>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* A taste of the catalogue */}
      <section aria-labelledby="catalog-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="catalog-heading" className="font-display text-2xl font-semibold">
              Open for enrolment
            </h2>
            <p className="mt-1 text-muted">A few of the courses published right now.</p>
          </div>
          <Link to="/courses">
            <Button variant="outline">See the full catalogue</Button>
          </Link>
        </div>

        <div className="mt-5">
          {isLoadingCourses && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
              <p className="sr-only">Loading courses…</p>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-64 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {!isLoadingCourses && courses.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <GraduationCap className="mx-auto size-8 text-muted" aria-hidden="true" />
                <p className="mt-3 font-medium">No courses are published yet.</p>
                <p className="mt-1 text-sm text-muted">
                  Check back soon, or create an account so you are ready when they are.
                </p>
              </CardContent>
            </Card>
          )}

          {!isLoadingCourses && courses.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <li key={course.id}>
                  <CourseCard course={course} to={`/courses/${course.slug}`} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Verify a certificate — the only way in without a link to follow. */}
      <section aria-labelledby="verify-heading">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-xl bg-success-soft p-2.5">
                <BadgeCheck className="size-5 text-success" aria-hidden="true" />
              </span>
              <div>
                <CardTitle id="verify-heading" className="text-lg">
                  Check a certificate
                </CardTitle>
                <p className="mt-1 text-sm text-muted">
                  Holding a certificate from EduNexa? Enter its verification code or
                  certificate number. No account needed.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-6">
            <form onSubmit={verify} className="flex flex-wrap gap-3 sm:max-w-lg">
              <Input
                aria-label="Verification code or certificate number"
                placeholder="e.g. LMS-2026-000001"
                className="min-w-[14rem] flex-1"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <Button type="submit" disabled={code.trim() === ""}>
                Verify
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Closing call to action */}
      <section className="rounded-2xl border border-soft bg-surface px-6 py-10 text-center">
        <h2 className="font-display text-2xl font-semibold">Ready to start?</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          Creating an account takes a moment and gets you a student profile. Instructors
          and administrators are set up by your organisation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/register">
            <Button>
              Create an account
            </Button>
          </Link>
          <Link to="/help">
            <Button variant="outline">
              Read the help pages
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
};
