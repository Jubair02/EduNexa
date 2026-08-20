import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { LessonViewerPage } from "@/pages/courses/LessonViewerPage";
import { lessonsService } from "@/services/lessons.service";
import { progressService } from "@/services/progress.service";
import type { Lesson, LessonContext, User } from "@/types";
import { makeAuthValue, makeUser } from "./helpers";

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

const mockedLessons = vi.mocked(lessonsService);
const mockedProgress = vi.mocked(progressService);

const baseLesson: Lesson = {
  id: "l-2",
  module: "m-1",
  course: "c-1",
  title: "The Middle Lesson",
  description: "A lesson in the middle of the course.",
  type: "text",
  content: "This is the lesson body text.",
  order: 2,
  isPublished: true,
  isPreview: false,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const baseContext: LessonContext = {
  courseId: "c-1",
  courseTitle: "Context Course",
  courseSlug: "context-course",
  moduleId: "m-1",
  moduleTitle: "Context Module",
  previousLessonId: "l-1",
  nextLessonId: "l-3",
};

const renderViewer = (lessonId = "l-2", authUser: User | null = null) =>
  render(
    <AuthContext.Provider value={makeAuthValue(authUser)}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/courses/context-course/lessons/${lessonId}`]}>
          <Routes>
            <Route
              path="/courses/:slug/lessons/:lessonId"
              element={<LessonViewerPage />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );

const student = makeUser({ role: "student", firstName: "Vic" });

describe("LessonViewerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a text lesson with course/module context and prev/next navigation", async () => {
    mockedLessons.get.mockResolvedValue({ lesson: baseLesson, context: baseContext });

    renderViewer();

    expect(await screen.findByText("The Middle Lesson")).toBeInTheDocument();
    expect(screen.getByText("This is the lesson body text.")).toBeInTheDocument();
    expect(screen.getByText(/Context Course · Context Module/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Previous lesson/ })).toHaveAttribute(
      "href",
      "/courses/context-course/lessons/l-1"
    );
    expect(screen.getByRole("link", { name: /Next lesson/ })).toHaveAttribute(
      "href",
      "/courses/context-course/lessons/l-3"
    );
    expect(screen.getByRole("link", { name: /Back to course/ })).toHaveAttribute(
      "href",
      "/courses/context-course"
    );
  });

  it("renders a YouTube video lesson as an embed iframe", async () => {
    mockedLessons.get.mockResolvedValue({
      lesson: {
        ...baseLesson,
        type: "video",
        content: undefined,
        videoUrl: "https://www.youtube.com/watch?v=abc123",
        title: "Video Time",
      },
      context: { ...baseContext, previousLessonId: null, nextLessonId: null },
    });

    renderViewer();

    expect(await screen.findByText("Video Time")).toBeInTheDocument();
    expect(screen.getByTitle("Video Time")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/abc123"
    );
    expect(screen.queryByRole("link", { name: /Previous lesson/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Next lesson/ })).not.toBeInTheDocument();
  });

  it("renders a document lesson with a download link", async () => {
    mockedLessons.get.mockResolvedValue({
      lesson: {
        ...baseLesson,
        type: "document",
        content: undefined,
        fileUrl: "https://files.example.com/notes.docx",
        fileName: "notes.docx",
        title: "Handout",
      },
      context: baseContext,
    });

    renderViewer();

    expect(await screen.findByText("Handout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open document/ })).toHaveAttribute(
      "href",
      "https://files.example.com/notes.docx"
    );
  });

  it("shows a friendly error when the lesson is unavailable", async () => {
    mockedLessons.get.mockRejectedValue(new Error("Lesson not found"));

    renderViewer("gone");

    expect(await screen.findByText("This lesson isn't available.")).toBeInTheDocument();
  });
});

describe("LessonViewerPage completion controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLessons.get.mockResolvedValue({ lesson: baseLesson, context: baseContext });
  });

  it("lets an enrolled student mark the lesson complete from this viewer too", async () => {
    mockedProgress.getLessonProgress.mockResolvedValue({
      lessonId: "l-2",
      isCompleted: false,
    });
    mockedProgress.setLessonProgress.mockResolvedValue({
      progress: { lessonId: "l-2", isCompleted: true, completedAt: "now" },
      courseProgress: {
        courseId: "c-1",
        totalLessons: 1,
        completedLessons: 1,
        totalRequiredQuizzes: 0,
        passedRequiredQuizzes: 0,
        totalRequiredItems: 1,
        completedRequiredItems: 1,
        progressPercentage: 100,
        isCompleted: true,
        certificateAvailable: false,
        completedLessonIds: ["l-2"],
        passedQuizIds: [],
      },
    });

    renderViewer("l-2", student);

    await userEvent.click(
      await screen.findByRole("button", { name: /Mark as Complete/ })
    );

    await waitFor(() => {
      expect(mockedProgress.setLessonProgress).toHaveBeenCalledWith("l-2", true);
    });
    expect(await screen.findByText("Lesson marked complete")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /Mark as Incomplete/ })
    ).toBeInTheDocument();
  });

  it("hides the control when progress can't be tracked", async () => {
    // Not enrolled: the progress endpoint rejects, so no control is offered.
    mockedProgress.getLessonProgress.mockRejectedValue(new Error("Forbidden"));

    renderViewer("l-2", student);

    expect(await screen.findByText("The Middle Lesson")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark as Complete/ })
    ).not.toBeInTheDocument();
  });

  it("never asks for progress when nobody is signed in", async () => {
    renderViewer("l-2", null);

    expect(await screen.findByText("The Middle Lesson")).toBeInTheDocument();
    expect(mockedProgress.getLessonProgress).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Mark as Complete/ })
    ).not.toBeInTheDocument();
  });
});
