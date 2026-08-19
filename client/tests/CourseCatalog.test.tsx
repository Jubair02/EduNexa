import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseCatalogPage } from "@/pages/courses/CourseCatalogPage";
import { PublicCourseDetailsPage } from "@/pages/courses/PublicCourseDetailsPage";
import { coursesService } from "@/services/courses.service";
import { makeCourse, renderWithProviders } from "./helpers";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { makeAuthValue } from "./helpers";

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

vi.mock("@/services/lessons.service", () => ({
  lessonsService: {
    listByModule: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
  },
}));

const mockedService = vi.mocked(coursesService);

describe("CourseCatalogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists published courses as cards in catalog view (works signed out)", async () => {
    mockedService.list.mockResolvedValue({
      courses: [
        makeCourse({ title: "Public React Course", status: "published" }),
        makeCourse({ title: "Public Design Course", status: "published" }),
      ],
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });

    renderWithProviders(<CourseCatalogPage />, { authUser: null });

    expect(await screen.findByText("Public React Course")).toBeInTheDocument();
    expect(screen.getByText("Public Design Course")).toBeInTheDocument();
    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({ view: "catalog" })
    );
  });

  it("sends search and filters to the API", async () => {
    mockedService.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });

    renderWithProviders(<CourseCatalogPage />, { authUser: null });
    await screen.findByText("No courses found.");

    await userEvent.type(screen.getByLabelText("Search courses"), "react");
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "react" })
      );
    });

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by level"),
      "advanced"
    );
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ level: "advanced" })
      );
    });
  });
});

describe("PublicCourseDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDetails = (slug: string) =>
    render(
      <AuthContext.Provider value={makeAuthValue(null)}>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/courses/${slug}`]}>
            <Routes>
              <Route path="/courses/:slug" element={<PublicCourseDetailsPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    );

  it("shows the course and the enrollment placeholder", async () => {
    mockedService.get.mockResolvedValue(
      makeCourse({ title: "Slugged Course", slug: "slugged-course", status: "published" })
    );

    renderDetails("slugged-course");

    expect(await screen.findByText("Slugged Course")).toBeInTheDocument();
    // Anonymous visitors see the sign-in entry point for enrollment.
    expect(
      screen.getByText("Sign in as a student to enroll in this course.")
    ).toBeInTheDocument();
    expect(mockedService.get).toHaveBeenCalledWith("slugged-course");
  });

  it("shows a friendly error for unavailable courses", async () => {
    mockedService.get.mockRejectedValue(new Error("Course not found"));

    renderDetails("nope");

    expect(await screen.findByText("This course isn't available.")).toBeInTheDocument();
  });
});
