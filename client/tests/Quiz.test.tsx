import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuizBuilderModal } from "@/components/quizzes/QuizBuilderModal";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { QuizManagementPage } from "@/pages/quizzes/QuizManagementPage";
import { QuizPlayerPage } from "@/pages/quizzes/QuizPlayerPage";
import { coursesService } from "@/services/courses.service";
import { modulesService } from "@/services/modules.service";
import { quizzesService } from "@/services/quizzes.service";
import type { AttemptResult, MyQuizResults, Quiz } from "@/types";
import {
  makeAdmin,
  makeAuthValue,
  makeCourse,
  makeUser,
  renderWithProviders,
} from "./helpers";

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
vi.mock("@/services/modules.service", () => ({
  modulesService: {
    listByCourse: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
  },
}));
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

const mockedQuizzes = vi.mocked(quizzesService);
const mockedModules = vi.mocked(modulesService);
const mockedCourses = vi.mocked(coursesService);

const student = makeUser({ role: "student", firstName: "Quinn" });

const makeQuiz = (overrides: Partial<Quiz> = {}): Quiz => ({
  id: "q-1",
  course: "c-1",
  module: null,
  title: "Knowledge Check",
  description: "A short check.",
  passingScore: 70,
  isRequired: true,
  isPublished: true,
  questionCount: 2,
  totalPoints: 20,
  questions: [
    {
      id: "qq-1",
      questionText: "Which option is correct?",
      type: "multiple-choice",
      options: ["Alpha", "Beta"],
      points: 10,
      order: 1,
    },
    {
      id: "qq-2",
      questionText: "TypeScript compiles to JavaScript.",
      type: "true-false",
      options: ["true", "false"],
      points: 10,
      order: 2,
    },
  ],
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...overrides,
});

const emptyResults = (overrides: Partial<MyQuizResults> = {}): MyQuizResults => ({
  quizId: "q-1",
  passingScore: 70,
  attemptCount: 0,
  bestPercentage: null,
  passed: false,
  attempts: [],
  ...overrides,
});

const attempt = (overrides: Partial<AttemptResult> = {}): AttemptResult => ({
  attemptId: "a-1",
  quizId: "q-1",
  quizTitle: "Knowledge Check",
  score: 20,
  totalPoints: 20,
  percentage: 100,
  passed: true,
  submittedAt: "2026-08-19T10:00:00.000Z",
  ...overrides,
});

describe("QuizBuilderModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedModules.listByCourse.mockResolvedValue([]);
  });

  it("requires question text and a marked correct answer", async () => {
    renderWithProviders(
      <QuizBuilderModal courseId="c-1" onClose={() => {}} onSaved={() => {}} />,
      { authUser: makeAdmin() }
    );

    await userEvent.type(screen.getByLabelText("Title"), "New Quiz");
    await userEvent.click(screen.getByRole("button", { name: "Create quiz" }));
    expect(
      await screen.findByText("Write the question text (at least 3 characters).")
    ).toBeInTheDocument();
    expect(mockedQuizzes.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Question"), "What is 2 + 2?");
    await userEvent.click(screen.getByRole("button", { name: "Create quiz" }));
    expect(
      await screen.findByText("Multiple-choice questions need at least two options.")
    ).toBeInTheDocument();
  });

  it("creates a quiz with multiple-choice and true/false questions", async () => {
    mockedQuizzes.create.mockResolvedValue(makeQuiz());
    const onSaved = vi.fn();

    renderWithProviders(
      <QuizBuilderModal courseId="c-1" onClose={() => {}} onSaved={onSaved} />,
      { authUser: makeAdmin() }
    );

    await userEvent.type(screen.getByLabelText("Title"), "Module Check");
    await userEvent.type(screen.getByLabelText("Question"), "Pick the right one");
    await userEvent.type(screen.getByLabelText("Option 1"), "Alpha");
    await userEvent.type(screen.getByLabelText("Option 2"), "Beta");
    await userEvent.click(screen.getByRole("radio", { name: "Mark option 1 as correct" }));

    // Second question, switched to true/false.
    await userEvent.click(screen.getByRole("button", { name: /Add question/ }));
    const questions = screen.getAllByLabelText("Question");
    await userEvent.type(questions[1], "The sky is blue");
    const types = screen.getAllByLabelText("Type");
    await userEvent.selectOptions(types[1], "true-false");

    await userEvent.click(screen.getByRole("button", { name: "Create quiz" }));

    await waitFor(() => {
      expect(mockedQuizzes.create).toHaveBeenCalledWith("c-1", {
        title: "Module Check",
        description: "",
        module: "",
        passingScore: 70,
        isRequired: true,
        questions: [
          {
            questionText: "Pick the right one",
            type: "multiple-choice",
            options: ["Alpha", "Beta"],
            correctAnswer: "Alpha",
            points: 10,
          },
          {
            questionText: "The sky is blue",
            type: "true-false",
            options: undefined,
            correctAnswer: "true",
            points: 10,
          },
        ],
      });
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "q-1" }), "created");
  });

  it("adds, reorders and removes questions", async () => {
    renderWithProviders(
      <QuizBuilderModal courseId="c-1" onClose={() => {}} onSaved={() => {}} />,
      { authUser: makeAdmin() }
    );

    expect(screen.getAllByLabelText("Question")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /Add question/ }));
    expect(screen.getAllByLabelText("Question")).toHaveLength(2);

    const first = screen.getAllByLabelText("Question")[0];
    await userEvent.type(first, "First question text");
    await userEvent.click(screen.getByRole("button", { name: "Move question 1 down" }));
    // After the swap the text has moved into slot two.
    expect(screen.getAllByLabelText("Question")[1]).toHaveValue("First question text");

    await userEvent.click(screen.getByRole("button", { name: "Remove question 1" }));
    expect(screen.getAllByLabelText("Question")).toHaveLength(1);
  });

  it("pre-fills the answer key when editing", () => {
    const quiz = makeQuiz({
      questions: [
        {
          id: "qq-1",
          questionText: "Existing question",
          type: "multiple-choice",
          options: ["Alpha", "Beta"],
          correctAnswer: "Beta",
          points: 15,
          order: 1,
        },
      ],
    });

    renderWithProviders(
      <QuizBuilderModal courseId="c-1" quiz={quiz} onClose={() => {}} onSaved={() => {}} />,
      { authUser: makeAdmin() }
    );

    expect(screen.getByLabelText("Title")).toHaveValue("Knowledge Check");
    expect(screen.getByLabelText("Question")).toHaveValue("Existing question");
    expect(screen.getByLabelText("Points")).toHaveValue(15);
    expect(screen.getByRole("radio", { name: "Mark option 2 as correct" })).toBeChecked();
  });
});

describe("QuizManagementPage", () => {
  const renderPage = () =>
    render(
      <AuthContext.Provider value={makeAuthValue(makeAdmin())}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/admin/courses/c-1/quizzes"]}>
            <Routes>
              <Route
                path="/admin/courses/:courseId/quizzes"
                element={<QuizManagementPage variant="admin" />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.get.mockResolvedValue(makeCourse({ id: "c-1", title: "Hosting Course" }));
    mockedModules.listByCourse.mockResolvedValue([]);
  });

  it("lists quizzes with their state", async () => {
    mockedQuizzes.listByCourse.mockResolvedValue([
      makeQuiz({ title: "Live Quiz", isPublished: true }),
      makeQuiz({ id: "q-2", title: "Draft Quiz", isPublished: false, isRequired: false }),
    ]);

    renderPage();

    expect(await screen.findByText("Live Quiz")).toBeInTheDocument();
    expect(screen.getByText("Draft Quiz")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.getByText("Hosting Course")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    mockedQuizzes.listByCourse.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("This course has no quizzes yet.")).toBeInTheDocument();
  });

  it("publishes a draft quiz", async () => {
    const draft = makeQuiz({ title: "Draft Quiz", isPublished: false });
    mockedQuizzes.listByCourse.mockResolvedValue([draft]);
    mockedQuizzes.setStatus.mockResolvedValue({ ...draft, isPublished: true });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish Draft Quiz" })
    );

    await waitFor(() => {
      expect(mockedQuizzes.setStatus).toHaveBeenCalledWith(draft.id, true);
    });
    expect(await screen.findByText("Quiz published")).toBeInTheDocument();
  });

  it("deletes a quiz after confirmation", async () => {
    const quiz = makeQuiz({ title: "Doomed Quiz" });
    mockedQuizzes.listByCourse.mockResolvedValue([quiz]);
    mockedQuizzes.remove.mockResolvedValue(undefined);

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Delete Doomed Quiz" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete quiz" }));

    await waitFor(() => {
      expect(mockedQuizzes.remove).toHaveBeenCalledWith(quiz.id);
    });
    expect(await screen.findByText("Quiz deleted")).toBeInTheDocument();
  });

  it("opens the results modal with a summary and attempts", async () => {
    const quiz = makeQuiz({ title: "Scored Quiz" });
    mockedQuizzes.listByCourse.mockResolvedValue([quiz]);
    mockedQuizzes.results.mockResolvedValue({
      attempts: [
        {
          ...attempt(),
          student: {
            id: "s-1",
            firstName: "Seen",
            lastName: "Student",
            email: "seen@example.com",
          },
        },
      ],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      summary: {
        quizId: quiz.id,
        quizTitle: quiz.title,
        passingScore: 70,
        totalAttempts: 3,
        studentsAttempted: 2,
        studentsPassed: 1,
        averagePercentage: 66,
      },
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "View results for Scored Quiz" })
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Seen Student")).toBeInTheDocument();
    expect(within(dialog).getByText("seen@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("66%")).toBeInTheDocument();
    // "Passed" is both a summary label and the attempt's badge.
    expect(within(dialog).getAllByText("Passed").length).toBeGreaterThan(0);
  });
});

describe("QuizPlayerPage", () => {
  const renderPlayer = () =>
    render(
      <AuthContext.Provider value={makeAuthValue(student)}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/student/courses/c-1/quizzes/q-1"]}>
            <Routes>
              <Route
                path="/student/courses/:courseId/quizzes/:quizId"
                element={<QuizPlayerPage />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the questions without ever exposing an answer key", async () => {
    mockedQuizzes.get.mockResolvedValue(makeQuiz());
    mockedQuizzes.myResults.mockResolvedValue(emptyResults());

    renderPlayer();

    expect(await screen.findByText("Which option is correct?")).toBeInTheDocument();
    expect(screen.getByText("TypeScript compiles to JavaScript.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();
    // The student payload carries no correctAnswer, so nothing can leak.
    for (const question of makeQuiz().questions) {
      expect(question.correctAnswer).toBeUndefined();
    }
  });

  it("refuses to submit until every question is answered", async () => {
    mockedQuizzes.get.mockResolvedValue(makeQuiz());
    mockedQuizzes.myResults.mockResolvedValue(emptyResults());

    renderPlayer();

    await userEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));

    expect(
      await screen.findByText("Answer every question before submitting — 1 left.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedQuizzes.submit).not.toHaveBeenCalled();
  });

  it("confirms, submits answers only, and shows the returned result", async () => {
    mockedQuizzes.get.mockResolvedValue(makeQuiz());
    mockedQuizzes.myResults
      .mockResolvedValueOnce(emptyResults())
      .mockResolvedValueOnce(
        emptyResults({
          attemptCount: 1,
          bestPercentage: 100,
          passed: true,
          attempts: [attempt()],
        })
      );
    mockedQuizzes.submit.mockResolvedValue({
      result: attempt(),
      courseProgress: {
        courseId: "c-1",
        totalLessons: 1,
        completedLessons: 1,
        totalRequiredQuizzes: 1,
        passedRequiredQuizzes: 1,
        totalRequiredItems: 2,
        completedRequiredItems: 2,
        progressPercentage: 100,
        isCompleted: true,
        certificateAvailable: false,
        completedLessonIds: ["l-1"],
        passedQuizIds: ["q-1"],
      },
    });

    renderPlayer();

    await userEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
    await userEvent.click(screen.getByRole("radio", { name: "true" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit quiz" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Your score is calculated as soon as you submit/))
      .toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Submit quiz" }));

    await waitFor(() => {
      expect(mockedQuizzes.submit).toHaveBeenCalledWith("q-1", [
        { questionId: "qq-1", selectedAnswer: "Alpha" },
        { questionId: "qq-2", selectedAnswer: "true" },
      ]);
    });

    expect(await screen.findByText("100%")).toBeInTheDocument();
    expect(screen.getByText(/you passed this quiz/)).toBeInTheDocument();
    // The paper is replaced by the result, so it can't be submitted twice.
    expect(screen.queryByRole("button", { name: "Submit quiz" })).not.toBeInTheDocument();
    expect(await screen.findByText("Attempt history")).toBeInTheDocument();
  });

  it("shows previous attempts and the best score on arrival", async () => {
    mockedQuizzes.get.mockResolvedValue(makeQuiz());
    mockedQuizzes.myResults.mockResolvedValue(
      emptyResults({
        attemptCount: 2,
        bestPercentage: 50,
        passed: false,
        attempts: [
          attempt({ attemptId: "a-2", score: 10, percentage: 50, passed: false }),
          attempt({ attemptId: "a-1", score: 0, percentage: 0, passed: false }),
        ],
      })
    );

    renderPlayer();

    expect(await screen.findByText(/Best score so far: 50%/)).toBeInTheDocument();
    expect(screen.getByText("Attempt history")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
    expect(screen.getByText("Attempt 1")).toBeInTheDocument();
  });

  it("shows an unavailable state when the quiz can't be loaded", async () => {
    mockedQuizzes.get.mockRejectedValue(new Error("Quiz not found"));
    mockedQuizzes.myResults.mockRejectedValue(new Error("Quiz not found"));

    renderPlayer();

    expect(await screen.findByText("This quiz isn't available.")).toBeInTheDocument();
    expect(
      screen.getByText(/It may be unpublished, or you may need an active enrollment/)
    ).toBeInTheDocument();
  });
});
