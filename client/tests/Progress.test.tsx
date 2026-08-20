import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { LearnPage } from "@/pages/student/LearnPage";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { lessonsService } from "@/services/lessons.service";
import { modulesService } from "@/services/modules.service";
import { progressService } from "@/services/progress.service";
import { quizzesService } from "@/services/quizzes.service";
import type { CourseProgress, Quiz } from "@/types";
import { makeAuthValue, makeCourse, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/courses.service", () => ({
  coursesService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    statistics: vi.fn(),
  },
}));
vi.mock("@/services/enrollments.service", () => ({
  enrollmentsService: {
    enroll: vi.fn(),
    check: vi.fn(),
    myCourses: vi.fn(),
    get: vi.fn(),
    cancel: vi.fn(),
    listByCourse: vi.fn(),
    listAll: vi.fn(),
    statistics: vi.fn(),
  },
}));
vi.mock("@/services/modules.service", () => ({
  modulesService: {
    listByCourse: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
  },
}));
vi.mock("@/services/lessons.service", () => ({
  lessonsService: {
    listByModule: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
  },
}));
vi.mock("@/services/progress.service", () => ({
  progressService: {
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
vi.mock("@/services/certificates.service", () => ({
  certificatesService: {
    list: vi.fn(),
    get: vi.fn(),
    download: vi.fn(),
    verify: vi.fn(),
    setStatus: vi.fn(),
    courseCompletionStatistics: vi.fn(),
  },
}));

const mockedCourses = vi.mocked(coursesService);
const mockedEnrollments = vi.mocked(enrollmentsService);
const mockedModules = vi.mocked(modulesService);
const mockedLessons = vi.mocked(lessonsService);
const mockedProgress = vi.mocked(progressService);
const mockedQuizzes = vi.mocked(quizzesService);
const mockedCertificates = vi.mocked(certificatesService);

const noCertificates = {
  certificates: [],
  pagination: { page: 1, limit: 3, total: 0, totalPages: 0 },
};

const student = makeUser({ role: "student", firstName: "Lea", id: "student-1" });

const makeProgress = (overrides: Partial<CourseProgress> = {}): CourseProgress => ({
  courseId: "c-1",
  totalLessons: 2,
  completedLessons: 1,
  totalRequiredQuizzes: 0,
  passedRequiredQuizzes: 0,
  totalRequiredItems: 2,
  completedRequiredItems: 1,
  progressPercentage: 50,
  isCompleted: false,
  certificateAvailable: false,
  completedLessonIds: ["l-1"],
  passedQuizIds: [],
  ...overrides,
});

const lessonSummary = (id: string, title: string) => ({
  id,
  module: "m-1",
  course: "c-1",
  title,
  type: "text" as const,
  order: 1,
  isPublished: true,
  isPreview: false,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
});

const fullLesson = (id: string, title: string) => ({
  lesson: { ...lessonSummary(id, title), content: "Lesson body." },
  context: {
    courseId: "c-1",
    courseTitle: "Tracked Course",
    courseSlug: "tracked-course",
    moduleId: "m-1",
    moduleTitle: "Module One",
    previousLessonId: null,
    nextLessonId: null,
  },
});

const setupLearn = (
  progress: CourseProgress = makeProgress(),
  quizzes: Quiz[] = []
): void => {
  mockedCourses.get.mockResolvedValue(
    makeCourse({ id: "c-1", title: "Tracked Course", slug: "tracked-course" })
  );
  mockedEnrollments.check.mockResolvedValue({
    isEnrolled: true,
    enrollmentId: "e-1",
    status: "active",
  });
  mockedModules.listByCourse.mockResolvedValue([
    {
      id: "m-1",
      course: "c-1",
      title: "Module One",
      order: 1,
      isPublished: true,
      lessonCount: 2,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
    },
  ]);
  mockedLessons.listByModule.mockResolvedValue([
    lessonSummary("l-1", "First Lesson"),
    lessonSummary("l-2", "Second Lesson"),
  ]);
  mockedLessons.get.mockResolvedValue(fullLesson("l-1", "First Lesson"));
  mockedQuizzes.listByCourse.mockResolvedValue(quizzes);
  mockedProgress.getCourseProgress.mockResolvedValue(progress);
};

const renderLearn = () =>
  render(
    <AuthContext.Provider value={makeAuthValue(student)}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/student/courses/c-1/learn"]}>
          <Routes>
            <Route path="/student/courses/:courseId/learn" element={<LearnPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );

describe("LearnPage progress display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the course progress meter and per-lesson completion state", async () => {
    setupLearn();
    renderLearn();

    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(
      screen.getByText("1 of 2 required items complete")
    ).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Course content" });
    // The completed lesson is announced as such; the other one isn't.
    expect(
      within(nav).getByRole("button", { name: /First Lesson.*Completed/ })
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: /Second Lesson/ })
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole("button", { name: /Second Lesson.*Completed/ })
    ).not.toBeInTheDocument();
  });

  it("marks the open lesson complete and updates progress without reloading", async () => {
    setupLearn(makeProgress({ completedLessonIds: [], completedLessons: 0, completedRequiredItems: 0, progressPercentage: 0 }));
    mockedProgress.setLessonProgress.mockResolvedValue({
      progress: { lessonId: "l-1", isCompleted: true, completedAt: "now" },
      courseProgress: makeProgress(),
    });

    renderLearn();
    await screen.findByText("0%");

    await userEvent.click(await screen.findByRole("button", { name: /Mark as Complete/ }));

    await waitFor(() => {
      expect(mockedProgress.setLessonProgress).toHaveBeenCalledWith("l-1", true);
    });
    // Fresh totals come back from the same call — no refetch of the course.
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(mockedProgress.getCourseProgress).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Lesson marked complete")).toBeInTheDocument();
  });

  it("offers Mark as Incomplete once a lesson is done", async () => {
    setupLearn();
    mockedProgress.setLessonProgress.mockResolvedValue({
      progress: { lessonId: "l-1", isCompleted: false },
      courseProgress: makeProgress({
        completedLessonIds: [],
        completedLessons: 0,
        completedRequiredItems: 0,
        progressPercentage: 0,
      }),
    });

    renderLearn();

    // The completed badge and the sidebar's screen-reader label both say
    // "Completed", so assert on the action the state unlocks.
    const undo = await screen.findByRole("button", { name: /Mark as Incomplete/ });
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    await userEvent.click(undo);

    await waitFor(() => {
      expect(mockedProgress.setLessonProgress).toHaveBeenCalledWith("l-1", false);
    });
    expect(await screen.findByText("Lesson marked incomplete")).toBeInTheDocument();
  });

  it("lists quizzes in the sidebar and flags the ones already passed", async () => {
    const quizzes: Quiz[] = [
      {
        id: "q-1",
        course: "c-1",
        module: "m-1",
        title: "Module Quiz",
        passingScore: 70,
        isRequired: true,
        isPublished: true,
        questionCount: 2,
        totalPoints: 20,
        questions: [],
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "q-2",
        course: "c-1",
        module: null,
        title: "Final Exam",
        passingScore: 70,
        isRequired: true,
        isPublished: true,
        questionCount: 1,
        totalPoints: 10,
        questions: [],
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
    ];
    setupLearn(makeProgress({ passedQuizIds: ["q-1"] }), quizzes);

    renderLearn();
    const nav = await screen.findByRole("navigation", { name: "Course content" });

    expect(within(nav).getByRole("link", { name: /Module Quiz/ })).toHaveAttribute(
      "href",
      "/student/courses/c-1/quizzes/q-1"
    );
    expect(within(nav).getByText("Course quizzes")).toBeInTheDocument();
    // The passed quiz announces its state; the outstanding one is marked required.
    expect(within(nav).getByRole("link", { name: /Module Quiz.*Passed/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Final Exam.*Required/ })).toBeInTheDocument();
  });

  it("blocks students without an active enrollment", async () => {
    setupLearn();
    mockedEnrollments.check.mockResolvedValue({
      isEnrolled: false,
      enrollmentId: null,
      status: null,
    });

    renderLearn();

    expect(
      await screen.findByText("You need an active enrollment to open this course.")
    ).toBeInTheDocument();
    expect(mockedProgress.getCourseProgress).not.toHaveBeenCalled();
  });
});

describe("StudentDashboard progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
    });
    mockedEnrollments.myCourses.mockResolvedValue({
      enrollments: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    mockedCertificates.list.mockResolvedValue(noCertificates);
  });

  it("shows learning statistics from the progress summary", async () => {
    mockedProgress.myCourses.mockResolvedValue({
      courses: [],
      summary: {
        activeCourses: 3,
        completedCourses: 1,
        overallProgressPercentage: 64,
        averageQuizScore: 82,
        quizzesAttempted: 4,
      },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("Active Courses")).toBeInTheDocument();
    expect(screen.getByText("Completed Courses")).toBeInTheDocument();
    expect(screen.getByText("Overall Progress")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("Average Quiz Score")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText(/Best attempt across 4 quizzes/)).toBeInTheDocument();
  });

  it("shows a dash when no quiz has been attempted", async () => {
    mockedProgress.myCourses.mockResolvedValue({
      courses: [],
      summary: {
        activeCourses: 1,
        completedCourses: 0,
        overallProgressPercentage: 0,
        averageQuizScore: null,
        quizzesAttempted: 0,
      },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("Average Quiz Score")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("No quizzes attempted yet")).toBeInTheDocument();
  });

  it("shows the real completion share on continue-learning cards", async () => {
    mockedProgress.myCourses.mockResolvedValue({
      courses: [
        {
          course: { id: "c-9", title: "Tracked Course", slug: "tracked-course" },
          enrollmentStatus: "active",
          progress: makeProgress({ courseId: "c-9", progressPercentage: 75 }),
        },
      ],
      summary: {
        activeCourses: 1,
        completedCourses: 0,
        overallProgressPercentage: 75,
        averageQuizScore: null,
        quizzesAttempted: 0,
      },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    mockedEnrollments.myCourses.mockResolvedValue({
      enrollments: [
        {
          id: "e-1",
          status: "active",
          enrolledAt: "2026-08-01T10:00:00.000Z",
          course: {
            id: "c-9",
            title: "Tracked Course",
            slug: "tracked-course",
            category: "programming",
            level: "beginner",
            status: "published",
            instructorName: "Ina Structor",
          },
          student: null,
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("75% complete")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });
});
