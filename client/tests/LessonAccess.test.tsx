import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { AdminEnrollmentsPage } from "@/pages/admin/AdminEnrollmentsPage";
import { LessonViewerPage } from "@/pages/courses/LessonViewerPage";
import { ApiRequestError } from "@/services/api";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { lessonsService } from "@/services/lessons.service";
import { makeAdmin, makeAuthValue, renderWithProviders } from "./helpers";
import type { Enrollment } from "@/types";

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

const mockedLessons = vi.mocked(lessonsService);
const mockedEnrollments = vi.mocked(enrollmentsService);
const mockedCourses = vi.mocked(coursesService);

describe("LessonViewerPage access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the enrollment-required state on a 403 response", async () => {
    mockedLessons.get.mockRejectedValue(
      new ApiRequestError("You need to enroll in this course to access this lesson.", 403)
    );

    render(
      <AuthContext.Provider value={makeAuthValue(null)}>
        <ToastProvider>
          <MemoryRouter initialEntries={["/courses/some-course/lessons/l-1"]}>
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

    expect(
      await screen.findByText("You need to enroll in this course to access this lesson.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to course page" })).toHaveAttribute(
      "href",
      "/courses/some-course"
    );
  });
});

describe("AdminEnrollmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
  });

  it("lists enrollments with student and course info", async () => {
    const enrollment: Enrollment = {
      id: "e-1",
      status: "active",
      enrolledAt: "2026-08-19T10:00:00.000Z",
      lastAccessedAt: "2026-08-19T12:00:00.000Z",
      course: {
        id: "c-1",
        title: "Admin Visible Course",
        slug: "admin-visible",
        category: "programming",
        level: "beginner",
        status: "published",
        instructorName: "Ina Structor",
      },
      student: {
        id: "s-1",
        firstName: "Seen",
        lastName: "Student",
        email: "seen@example.com",
      },
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
    };
    mockedEnrollments.listAll.mockResolvedValue({
      enrollments: [enrollment],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    renderWithProviders(<AdminEnrollmentsPage />, { authUser: makeAdmin() });

    // The responsive layout renders a table and a card list; both exist in
    // jsdom, so row assertions are scoped to the table.
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Seen Student")).toBeInTheDocument();
    expect(within(table).getByText("seen@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Admin Visible Course")).toBeInTheDocument();
    expect(within(table).getByText("Active")).toBeInTheDocument();

    // The same enrollment is reachable on a phone, without a sideways drag.
    const cards = screen.getByRole("list", { name: "Enrollments" });
    expect(within(cards).getByText("Seen Student")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    mockedEnrollments.listAll.mockResolvedValue({
      enrollments: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    renderWithProviders(<AdminEnrollmentsPage />, { authUser: makeAdmin() });

    expect(await screen.findByText("No enrollments found.")).toBeInTheDocument();
  });
});
