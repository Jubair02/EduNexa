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

describe("CourseCatalogPage layout and filter state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const listReturns = (count: number, total = count, page = 1) => {
    mockedService.list.mockResolvedValue({
      courses: Array.from({ length: count }, (_, index) =>
        makeCourse({ title: `Catalog Course ${index + 1}`, status: "published" })
      ),
      pagination: { page, limit: 12, total, totalPages: Math.ceil(total / 12) },
    });
  };

  const renderAt = (url = "/courses") =>
    renderWithProviders(<CourseCatalogPage />, {
      authUser: null,
      initialEntries: [url],
    });

  it("leads with a featured course once there is a row to lead", async () => {
    listReturns(6);
    renderAt();

    expect(await screen.findByText("Featured")).toBeInTheDocument();
    // The lead card gets the display treatment; the rest stay as cards.
    expect(screen.getByText("Catalog Course 1")).toBeInTheDocument();
    expect(screen.getByText("Catalog Course 6")).toBeInTheDocument();
  });

  it("skips the featured treatment when too few results would leave a broken grid", async () => {
    listReturns(2);
    renderAt();

    expect(await screen.findByText("Catalog Course 1")).toBeInTheDocument();
    expect(screen.queryByText("Featured")).not.toBeInTheDocument();
  });

  it("does not feature a course part-way through the results", async () => {
    listReturns(6, 40, 2);
    renderAt("/courses?page=2");

    expect(await screen.findByText("Catalog Course 1")).toBeInTheDocument();
    expect(screen.queryByText("Featured")).not.toBeInTheDocument();
    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 })
    );
  });

  it("restores filters from the URL so a filtered catalog can be shared", async () => {
    listReturns(4);
    renderAt("/courses?category=design&level=advanced&search=layout");

    await screen.findByText("Catalog Course 1");

    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "design",
        level: "advanced",
        search: "layout",
      })
    );
    expect(screen.getByLabelText("Filter by category")).toHaveValue("design");
    expect(screen.getByLabelText("Search courses")).toHaveValue("layout");
  });

  it("ignores filter values that are not real categories or levels", async () => {
    listReturns(4);
    renderAt("/courses?category=../etc/passwd&level=wizard&page=-3");

    await screen.findByText("Catalog Course 1");

    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({ category: "", level: "", page: 1 })
    );
  });

  it("shows a removable chip per active filter", async () => {
    listReturns(4);
    renderAt("/courses?category=design");

    const chip = await screen.findByRole("button", { name: /Remove filter Design/ });
    await userEvent.click(chip);

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "" })
      )
    );
  });

  it("clears every filter at once", async () => {
    listReturns(4);
    renderAt("/courses?category=design&level=beginner&search=grid");

    await screen.findByText("Catalog Course 1");
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "", level: "", search: "" })
      )
    );
    expect(screen.getByLabelText("Search courses")).toHaveValue("");
  });

  it("reports how many courses matched", async () => {
    listReturns(4, 47);
    renderAt();

    expect(await screen.findByText("47 courses available")).toBeInTheDocument();
  });

  it("says the count is filtered when filters are on", async () => {
    listReturns(4, 4);
    renderAt("/courses?level=beginner");

    expect(await screen.findByText("4 courses match these filters")).toBeInTheDocument();
  });

  it("offers a way out of an empty filtered result", async () => {
    mockedService.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });
    renderAt("/courses?category=design");

    await screen.findByText("No courses found.");
    await userEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    await waitFor(() =>
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "" })
      )
    );
  });

  it("names the range being shown rather than only the page number", async () => {
    listReturns(12, 47, 2);
    renderAt("/courses?page=2");

    expect(await screen.findByText("Showing 13–24 of 47")).toBeInTheDocument();
  });

  it("exposes the filters as a search landmark", async () => {
    listReturns(4);
    renderAt();

    await screen.findByText("Catalog Course 1");
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});
