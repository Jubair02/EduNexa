import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminQuizAttemptsPage } from "@/pages/admin/AdminQuizAttemptsPage";
import { StudentProgressPage } from "@/pages/student/StudentProgressPage";
import { StudentQuizzesPage } from "@/pages/student/StudentQuizzesPage";
import { progressService } from "@/services/progress.service";
import { quizzesService } from "@/services/quizzes.service";
import type { AttemptWithStudent, CourseProgress, StudentQuizOverview } from "@/types";
import { makeAdmin, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/progress.service", () => ({
  progressService: {
    completeLesson: vi.fn(),
    setLessonProgress: vi.fn(),
    getLessonProgress: vi.fn(),
    getCourseProgress: vi.fn(),
    myCourses: vi.fn(),
  },
}));
vi.mock("@/services/quizzes.service", () => ({
  quizzesService: {
    listByCourse: vi.fn(),
    myQuizzes: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    submit: vi.fn(),
    myResults: vi.fn(),
    results: vi.fn(),
    allAttempts: vi.fn(),
  },
}));

const mockedProgress = vi.mocked(progressService);
const mockedQuizzes = vi.mocked(quizzesService);

const student = makeUser({ role: "student", firstName: "Lea", id: "student-1" });

const makeProgress = (overrides: Partial<CourseProgress> = {}): CourseProgress => ({
  courseId: "c-1",
  totalLessons: 4,
  completedLessons: 2,
  totalRequiredQuizzes: 1,
  passedRequiredQuizzes: 0,
  totalRequiredItems: 5,
  completedRequiredItems: 2,
  progressPercentage: 40,
  isCompleted: false,
  certificateAvailable: false,
  completedLessonIds: [],
  passedQuizIds: [],
  ...overrides,
});

const makeQuizOverview = (
  overrides: Partial<StudentQuizOverview> = {}
): StudentQuizOverview => ({
  id: "q-1",
  course: "c-1",
  module: null,
  title: "Fundamentals Check",
  passingScore: 70,
  isRequired: true,
  isPublished: true,
  questionCount: 2,
  totalPoints: 20,
  questions: [],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  courseId: "c-1",
  courseTitle: "Tracked Course",
  attemptCount: 0,
  bestPercentage: null,
  passed: false,
  ...overrides,
});

describe("StudentProgressPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the summary tiles and a row per enrolled course", async () => {
    mockedProgress.myCourses.mockResolvedValue({
      courses: [
        {
          course: { id: "c-1", title: "Tracked Course", slug: "tracked-course" },
          enrollmentStatus: "active",
          progress: makeProgress(),
        },
        {
          course: { id: "c-2", title: "Finished Course", slug: "finished-course" },
          enrollmentStatus: "completed",
          progress: makeProgress({
            courseId: "c-2",
            completedLessons: 4,
            passedRequiredQuizzes: 1,
            completedRequiredItems: 5,
            progressPercentage: 100,
            isCompleted: true,
            certificateAvailable: true,
          }),
        },
      ],
      summary: {
        activeCourses: 1,
        completedCourses: 1,
        overallProgressPercentage: 70,
        averageQuizScore: 85,
        quizzesAttempted: 2,
      },
    });

    renderWithProviders(<StudentProgressPage />, { authUser: student });

    expect(await screen.findByText("Completed Courses")).toBeInTheDocument();
    expect(screen.getByText("Overall Progress")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Tracked Course" })).toHaveAttribute(
      "href",
      "/courses/tracked-course"
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(
      screen.getByText("2/4 lessons · 0/1 required quizzes")
    ).toBeInTheDocument();

    // The completed course offers its certificate; the in-progress one doesn't.
    expect(screen.getAllByRole("link", { name: /Certificate/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Continue/ })).toHaveAttribute(
      "href",
      "/student/courses/c-1/learn"
    );
    expect(screen.getByRole("link", { name: /Review/ })).toHaveAttribute(
      "href",
      "/student/courses/c-2/learn"
    );
  });

  it("invites the student to browse when nothing is enrolled", async () => {
    mockedProgress.myCourses.mockResolvedValue({
      courses: [],
      summary: {
        activeCourses: 0,
        completedCourses: 0,
        overallProgressPercentage: 0,
        averageQuizScore: null,
        quizzesAttempted: 0,
      },
    });

    renderWithProviders(<StudentProgressPage />, { authUser: student });

    expect(
      await screen.findByText("You haven't enrolled in any courses yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Courses/ })).toHaveAttribute(
      "href",
      "/courses"
    );
  });

  it("offers a retry when the request fails", async () => {
    mockedProgress.myCourses.mockRejectedValueOnce(new Error("network"));
    mockedProgress.myCourses.mockResolvedValueOnce({
      courses: [],
      summary: {
        activeCourses: 0,
        completedCourses: 0,
        overallProgressPercentage: 0,
        averageQuizScore: null,
        quizzesAttempted: 0,
      },
    });

    renderWithProviders(<StudentProgressPage />, { authUser: student });

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockedProgress.myCourses).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText("You haven't enrolled in any courses yet.")
    ).toBeInTheDocument();
  });
});

describe("StudentQuizzesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups quizzes by course and summarises the student's own attempts", async () => {
    mockedQuizzes.myQuizzes.mockResolvedValue([
      makeQuizOverview({ attemptCount: 2, bestPercentage: 100, passed: true }),
      makeQuizOverview({
        id: "q-2",
        title: "Final Exam",
        attemptCount: 1,
        bestPercentage: 40,
      }),
      makeQuizOverview({
        id: "q-3",
        course: "c-2",
        courseId: "c-2",
        courseTitle: "Second Course",
        title: "Warm Up",
        isRequired: false,
      }),
    ]);

    renderWithProviders(<StudentQuizzesPage />, { authUser: student });

    expect(await screen.findByText("1 of 3 passed across your courses.")).toBeInTheDocument();
    expect(screen.getByText("Tracked Course")).toBeInTheDocument();
    expect(screen.getByText("Second Course")).toBeInTheDocument();

    expect(screen.getByText("2 questions · pass at 70% · 2 attempts, best 100%"))
      .toBeInTheDocument();
    expect(screen.getByText("2 questions · pass at 70% · 1 attempt, best 40%"))
      .toBeInTheDocument();
    expect(screen.getByText("2 questions · pass at 70% · not attempted"))
      .toBeInTheDocument();

    // A passed quiz can be retaken; an untouched one is started.
    expect(screen.getByRole("link", { name: /Retake/ })).toHaveAttribute(
      "href",
      "/student/courses/c-1/quizzes/q-1"
    );
    expect(screen.getByRole("link", { name: /Try again/ })).toHaveAttribute(
      "href",
      "/student/courses/c-1/quizzes/q-2"
    );
    expect(screen.getByRole("link", { name: /Start quiz/ })).toHaveAttribute(
      "href",
      "/student/courses/c-2/quizzes/q-3"
    );
  });

  it("filters to outstanding quizzes and searches by title", async () => {
    mockedQuizzes.myQuizzes.mockResolvedValue([
      makeQuizOverview({ attemptCount: 1, bestPercentage: 90, passed: true }),
      makeQuizOverview({ id: "q-2", title: "Final Exam" }),
    ]);

    renderWithProviders(<StudentQuizzesPage />, { authUser: student });
    await screen.findByText("Fundamentals Check");

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter quizzes" }),
      "outstanding"
    );
    expect(screen.queryByText("Fundamentals Check")).not.toBeInTheDocument();
    expect(screen.getByText("Final Exam")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter quizzes" }),
      "all"
    );
    await userEvent.type(screen.getByRole("searchbox", { name: "Search quizzes" }), "final");
    expect(screen.getByText("Final Exam")).toBeInTheDocument();
    expect(screen.queryByText("Fundamentals Check")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search quizzes" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search quizzes" }), "zzz");
    expect(
      screen.getByText("No quizzes match your search or filter.")
    ).toBeInTheDocument();
  });

  it("explains the empty state when no course has published a quiz", async () => {
    mockedQuizzes.myQuizzes.mockResolvedValue([]);

    renderWithProviders(<StudentQuizzesPage />, { authUser: student });

    expect(await screen.findByText("No quizzes available yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Courses/ })).toHaveAttribute(
      "href",
      "/courses"
    );
  });

  it("offers a retry when the request fails", async () => {
    mockedQuizzes.myQuizzes.mockRejectedValueOnce(new Error("network"));
    mockedQuizzes.myQuizzes.mockResolvedValueOnce([]);

    renderWithProviders(<StudentQuizzesPage />, { authUser: student });

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockedQuizzes.myQuizzes).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("No quizzes available yet.")).toBeInTheDocument();
  });
});

describe("AdminQuizAttemptsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const attempt = (
    overrides: Partial<AttemptWithStudent> = {}
  ): AttemptWithStudent => ({
    attemptId: "a-1",
    quizId: "q-1",
    quizTitle: "Fundamentals Check",
    student: {
      id: "student-1",
      firstName: "Lea",
      lastName: "Learner",
      email: "lea@example.com",
    },
    score: 18,
    totalPoints: 20,
    percentage: 90,
    passed: true,
    submittedAt: "2026-08-10T09:00:00.000Z",
    ...overrides,
  });

  it("lists every attempt with its student, score and result", async () => {
    mockedQuizzes.allAttempts.mockResolvedValue({
      attempts: [
        attempt(),
        attempt({
          attemptId: "a-2",
          score: 4,
          percentage: 20,
          passed: false,
          student: {
            id: "student-2",
            firstName: "Sam",
            lastName: "Student",
            email: "sam@example.com",
          },
        }),
      ],
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });

    renderWithProviders(<AdminQuizAttemptsPage />, { authUser: makeAdmin() });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Lea Learner")).toBeInTheDocument();
    expect(within(table).getByText("lea@example.com")).toBeInTheDocument();
    expect(within(table).getByText("18/20")).toBeInTheDocument();
    expect(within(table).getByText("(90%)")).toBeInTheDocument();
    expect(within(table).getByText("Passed")).toBeInTheDocument();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
  });

  it("passes the result filter to the API and resets to page one", async () => {
    mockedQuizzes.allAttempts.mockResolvedValue({
      attempts: [attempt()],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    renderWithProviders(<AdminQuizAttemptsPage />, { authUser: makeAdmin() });
    await screen.findByRole("table");

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter by result" }),
      "false"
    );

    await waitFor(() => {
      expect(mockedQuizzes.allAttempts).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, passed: "false" })
      );
    });
  });

  it("survives an attempt whose student has been deleted", async () => {
    mockedQuizzes.allAttempts.mockResolvedValue({
      attempts: [attempt({ student: null })],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    renderWithProviders(<AdminQuizAttemptsPage />, { authUser: makeAdmin() });

    expect(await screen.findByText("Deleted user")).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been attempted", async () => {
    mockedQuizzes.allAttempts.mockResolvedValue({
      attempts: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    renderWithProviders(<AdminQuizAttemptsPage />, { authUser: makeAdmin() });

    expect(await screen.findByText("No quiz attempts found.")).toBeInTheDocument();
  });
});
