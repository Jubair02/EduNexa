import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstructorStudentsPage } from "@/pages/instructor/InstructorStudentsPage";
import { coursesService } from "@/services/courses.service";
import { teachingService } from "@/services/teaching.service";
import type { TeachingStudentRow } from "@/types";
import { makeCourse, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/teaching.service", () => ({
  teachingService: { overview: vi.fn(), students: vi.fn() },
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

const mockedTeaching = vi.mocked(teachingService);
const mockedCourses = vi.mocked(coursesService);

const instructor = makeUser({ role: "instructor", firstName: "Ina" });

const makeRow = (overrides: Partial<TeachingStudentRow> = {}): TeachingStudentRow => ({
  enrollmentId: "e-1",
  studentId: "s-1",
  firstName: "Ada",
  lastName: "Learner",
  email: "ada@example.com",
  courseId: "c-1",
  courseTitle: "Test-Driven TypeScript",
  status: "active",
  progressPercentage: 60,
  completedLessons: 3,
  totalLessons: 5,
  passedRequiredQuizzes: 0,
  totalRequiredQuizzes: 1,
  enrolledAt: "2026-07-01T10:00:00.000Z",
  lastAccessedAt: "2026-08-10T10:00:00.000Z",
  certificateIssued: false,
  ...overrides,
});

const result = (students: TeachingStudentRow[], total = students.length) => ({
  students,
  pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
});

const render = () =>
  renderWithProviders(<InstructorStudentsPage />, { authUser: instructor });

describe("InstructorStudentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [makeCourse({ id: "c-1", title: "Test-Driven TypeScript" })],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    mockedTeaching.students.mockResolvedValue(result([makeRow()]));
  });

  it("lists each enrolment with the student, course and progress", async () => {
    render();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Ada Learner")).toBeInTheDocument();
    expect(within(table).getByText("ada@example.com")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Test-Driven TypeScript" })).toHaveAttribute(
      "href",
      "/instructor/courses/c-1"
    );
    // Progress spells out what the percentage is made of.
    expect(
      within(table).getByLabelText("60% — 3/5 lessons, 0/1 quizzes")
    ).toBeInTheDocument();
  });

  it("repeats each row as a card for phones", async () => {
    render();

    const cards = await screen.findByRole("list", { name: "My students" });
    const row = within(cards).getAllByRole("listitem")[0];
    expect(row).toHaveTextContent("Ada Learner");
    expect(row).toHaveTextContent("3/5 lessons");
    expect(row).toHaveTextContent("0/1 required quizzes");
  });

  it("marks a student who has earned a certificate", async () => {
    mockedTeaching.students.mockResolvedValue(
      result([
        makeRow({
          status: "completed",
          progressPercentage: 100,
          certificateIssued: true,
        }),
      ])
    );

    render();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Certified")).toBeInTheDocument();
    expect(within(table).getByText("Completed")).toBeInTheDocument();
  });

  it("says when a student has never opened the course", async () => {
    mockedTeaching.students.mockResolvedValue(
      result([makeRow({ lastAccessedAt: undefined })])
    );

    render();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Never")).toBeInTheDocument();
  });

  it("passes search, course, status and sort through to the API", async () => {
    render();
    await screen.findByRole("table");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search students" }), "ada");
    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "ada", page: 1 })
      );
    });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter by status" }),
      "cancelled"
    );
    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "cancelled", page: 1 })
      );
    });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Sort students" }),
      "progress"
    );
    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenLastCalledWith(
        // Progress is most useful lowest-last, so it flips to descending.
        expect.objectContaining({ sortBy: "progress", sortOrder: "desc" })
      );
    });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Sort students" }),
      "name"
    );
    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenLastCalledWith(
        // Names read best A–Z.
        expect.objectContaining({ sortBy: "name", sortOrder: "asc" })
      );
    });
  });

  it("offers only the instructor's own courses in the filter", async () => {
    render();
    await screen.findByRole("table");

    expect(mockedCourses.list).toHaveBeenCalledWith(
      expect.objectContaining({ view: "manage" })
    );
    const filter = screen.getByRole("combobox", { name: "Filter by course" });
    expect(within(filter).getByRole("option", { name: "All my courses" })).toBeDefined();
    expect(
      within(filter).getByRole("option", { name: "Test-Driven TypeScript" })
    ).toBeDefined();
  });

  it("distinguishes an empty roster from an empty filter result", async () => {
    mockedTeaching.students.mockResolvedValue(result([], 0));
    const view = render();

    expect(await screen.findByText("Nobody is enrolled yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to my courses/ })).toBeInTheDocument();
    view.unmount();

    mockedTeaching.students.mockResolvedValue(result([], 0));
    render();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search students" }),
      "nobody"
    );

    expect(
      await screen.findByText("No students match your filters.")
    ).toBeInTheDocument();
    // No "go to courses" prompt when the roster is merely filtered down.
    expect(screen.queryByRole("link", { name: /Go to my courses/ })).not.toBeInTheDocument();
  });

  it("pages through a long roster", async () => {
    mockedTeaching.students.mockResolvedValue({
      students: [makeRow()],
      pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
    });

    render();

    expect(await screen.findByText("45 enrolments — page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it("offers a retry when the roster fails to load", async () => {
    mockedTeaching.students.mockRejectedValueOnce(new Error("network"));
    mockedTeaching.students.mockResolvedValueOnce(result([makeRow()]));

    render();

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockedTeaching.students).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("still lists a row whose account was deleted", async () => {
    mockedTeaching.students.mockResolvedValue(
      result([makeRow({ firstName: "Deleted", lastName: "user", email: "" })])
    );

    render();

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Deleted user")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();
  });
});
