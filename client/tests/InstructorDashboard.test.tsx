import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstructorDashboard } from "@/pages/instructor/InstructorDashboard";
import { teachingService } from "@/services/teaching.service";
import type { TeachingOverview } from "@/types";
import { makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/teaching.service", () => ({
  teachingService: { overview: vi.fn() },
}));

const mockedTeaching = vi.mocked(teachingService);

const instructor = makeUser({ role: "instructor", firstName: "Ina" });

const makeOverview = (overrides: Partial<TeachingOverview> = {}): TeachingOverview => ({
  courses: { total: 3, published: 2, draft: 1, archived: 0 },
  students: { total: 12, active: 9, completed: 3, cancelled: 2 },
  engagement: {
    averageProgress: 64,
    completions: 3,
    completionRate: 25,
    certificatesIssued: 3,
  },
  quizzes: { published: 4, attempts: 40, averageScore: 78, passRate: 70 },
  courseBreakdown: [
    {
      courseId: "c-1",
      title: "Test-Driven TypeScript",
      slug: "test-driven-typescript",
      status: "published",
      publishedLessons: 8,
      requiredQuizzes: 2,
      students: 10,
      completions: 3,
      completionRate: 30,
      averageProgress: 70,
      certificatesIssued: 3,
    },
    {
      courseId: "c-2",
      title: "Draft Course",
      slug: "draft-course",
      status: "draft",
      publishedLessons: 0,
      requiredQuizzes: 0,
      students: 0,
      completions: 0,
      completionRate: 0,
      averageProgress: 0,
      certificatesIssued: 0,
    },
  ],
  nudges: [
    {
      enrollmentId: "e-1",
      studentName: "Stalled Student",
      courseId: "c-1",
      courseTitle: "Test-Driven TypeScript",
      progressPercentage: 0,
      enrolledAt: "2026-07-01T10:00:00.000Z",
      lastAccessedAt: undefined,
    },
    {
      enrollmentId: "e-2",
      studentName: "Slow Starter",
      courseId: "c-1",
      courseTitle: "Test-Driven TypeScript",
      progressPercentage: 20,
      enrolledAt: "2026-07-02T10:00:00.000Z",
      lastAccessedAt: "2026-08-01T10:00:00.000Z",
    },
  ],
  ...overrides,
});

const render = () =>
  renderWithProviders(<InstructorDashboard />, { authUser: instructor });

/** The stat-tile region — "Students" also appears as a table column header. */
const stats = () => within(screen.getByRole("region", { name: "Teaching statistics" }));

/** The nudge list — percentages appear in the course table too. */
const nudgeList = () =>
  within(screen.getByRole("list", { name: "Students who could use a nudge" }));

describe("InstructorDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the teaching statistics an instructor actually needs", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    expect(await screen.findByText("Average Progress")).toBeInTheDocument();

    expect(stats().getByText("Students")).toBeInTheDocument();
    expect(stats().getByText("12")).toBeInTheDocument();
    expect(stats().getByText("64%")).toBeInTheDocument();
    expect(stats().getByText("Completion Rate")).toBeInTheDocument();
    expect(stats().getByText("25%")).toBeInTheDocument();
    expect(stats().getByText("3 students finished")).toBeInTheDocument();
    expect(stats().getByText("Average Quiz Score")).toBeInTheDocument();
    expect(stats().getByText("78%")).toBeInTheDocument();
    expect(stats().getByText("40 attempts, 70% passed")).toBeInTheDocument();
  });

  it("breaks the courses down row by row", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    const table = await screen.findByRole("table");
    const row = within(table).getByRole("link", { name: "Test-Driven TypeScript" });
    expect(row).toHaveAttribute("href", "/instructor/courses/c-1");
    expect(within(table).getByText("8 lessons · 2 required quizzes")).toBeInTheDocument();
    expect(within(table).getByText("(30%)")).toBeInTheDocument();
    // The draft course is listed too, with its status visible.
    expect(within(table).getByText("draft")).toBeInTheDocument();
  });

  it("lists the students who need a nudge, least advanced first", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    expect(await screen.findByText("Stalled Student")).toBeInTheDocument();

    const rows = nudgeList().getAllByRole("listitem");
    // Least advanced first.
    expect(rows[0]).toHaveTextContent("Stalled Student");
    expect(rows[0]).toHaveTextContent("0%");
    expect(rows[1]).toHaveTextContent("Slow Starter");
    expect(rows[1]).toHaveTextContent("20%");
    // Someone who never opened the course is described as such, not as a date.
    expect(rows[0]).toHaveTextContent("never opened the course");
  });

  it("says so plainly when nobody is falling behind", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview({ nudges: [] }));
    render();

    expect(await screen.findByText("Nobody is falling behind.")).toBeInTheDocument();
  });

  it("flags drafts and published courses with no lessons", async () => {
    mockedTeaching.overview.mockResolvedValue(
      makeOverview({
        courseBreakdown: [
          {
            courseId: "c-3",
            title: "Empty Published Course",
            slug: "empty",
            status: "published",
            publishedLessons: 0,
            requiredQuizzes: 0,
            students: 4,
            completions: 0,
            completionRate: 0,
            averageProgress: 0,
            certificatesIssued: 0,
          },
        ],
      })
    );
    render();

    expect(await screen.findByText("1 course still in draft")).toBeInTheDocument();
    expect(
      screen.getByText("1 published course with no lessons")
    ).toBeInTheDocument();
  });

  it("flags a pass rate low enough to suggest the bar is set wrong", async () => {
    mockedTeaching.overview.mockResolvedValue(
      makeOverview({
        quizzes: { published: 2, attempts: 20, averageScore: 41, passRate: 30 },
      })
    );
    render();

    expect(
      await screen.findByText("Only 30% of quiz attempts pass")
    ).toBeInTheDocument();
  });

  it("does not flag a low pass rate from a handful of attempts", async () => {
    mockedTeaching.overview.mockResolvedValue(
      makeOverview({
        quizzes: { published: 2, attempts: 3, averageScore: 20, passRate: 0 },
      })
    );
    render();

    await screen.findByText("Average Progress");
    expect(screen.queryByText(/of quiz attempts pass/)).not.toBeInTheDocument();
  });

  it("invites a brand-new instructor to create their first course", async () => {
    mockedTeaching.overview.mockResolvedValue(
      makeOverview({
        courses: { total: 0, published: 0, draft: 0, archived: 0 },
        students: { total: 0, active: 0, completed: 0, cancelled: 0 },
        engagement: {
          averageProgress: 0,
          completions: 0,
          completionRate: 0,
          certificatesIssued: 0,
        },
        quizzes: { published: 0, attempts: 0, averageScore: null, passRate: null },
        courseBreakdown: [],
        nudges: [],
      })
    );
    render();

    expect(await screen.findByText("You have no courses yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create a course/ })).toHaveAttribute(
      "href",
      "/instructor/courses/new"
    );
    expect(screen.getByText("No courses yet")).toBeInTheDocument();
    expect(screen.getByText("Nobody enrolled yet")).toBeInTheDocument();
    // A dash rather than "0%", which would imply a real measurement.
    expect(stats().getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No quizzes attempted yet")).toBeInTheDocument();
    expect(
      screen.getByText("No enrollments yet. Publish a course so students can join.")
    ).toBeInTheDocument();
  });

  it("offers only actions an instructor's role can actually perform", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    await screen.findByText("Average Progress");

    expect(screen.getByText("Teaching overview")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New course/ })).toHaveAttribute(
      "href",
      "/instructor/courses/new"
    );
    // "Manage users" is admin-only — offering it here would 403.
    expect(screen.queryByRole("link", { name: /Manage users/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Admin overview")).not.toBeInTheDocument();
    expect(screen.queryByText(/\/admin\//)).not.toBeInTheDocument();
  });

  it("shows the refresh time as a clock time, not a raw timestamp", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    await screen.findByText("Average Progress");

    const stamp = screen.getByText(/^Updated /);
    expect(stamp).toBeInTheDocument();
    // An ISO string leaking through would contain a "T" and a "Z".
    expect(stamp.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("offers a retry when the overview fails to load", async () => {
    mockedTeaching.overview.mockRejectedValueOnce(new Error("network"));
    mockedTeaching.overview.mockResolvedValueOnce(makeOverview());
    render();

    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(mockedTeaching.overview).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Average Progress")).toBeInTheDocument();
  });

  it("refreshes without dropping the numbers already on screen", async () => {
    mockedTeaching.overview.mockResolvedValue(makeOverview());
    render();

    await screen.findByText("Average Progress");
    await userEvent.click(screen.getByRole("button", { name: /Refresh/ }));

    await waitFor(() => {
      expect(mockedTeaching.overview).toHaveBeenCalledTimes(2);
    });
    expect(stats().getByText("12")).toBeInTheDocument();
  });
});
