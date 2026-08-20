import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { LandingPage } from "@/pages/LandingPage";
import { coursesService } from "@/services/courses.service";
import { makeAuthValue, makeCourse, renderWithProviders } from "./helpers";

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

const mockedCourses = vi.mocked(coursesService);

const listResult = (courses: ReturnType<typeof makeCourse>[]) => ({
  courses,
  pagination: { page: 1, limit: 3, total: courses.length, totalPages: 1 },
});

const render = () => renderWithProviders(<LandingPage />, { authUser: null });

/** Echoes the route param, so a navigation can be asserted on. */
const VerifyProbe = () => {
  const { verificationCode } = useParams<{ verificationCode: string }>();
  return <p>verifying: {verificationCode}</p>;
};

/**
 * MemoryRouter keeps history in memory, so `window.location` never moves —
 * navigation has to be observed by rendering the destination route.
 */
const renderWithRoutes = () =>
  rtlRender(
    <AuthContext.Provider value={makeAuthValue(null)}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/verify/certificate/:verificationCode"
              element={<VerifyProbe />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue(listResult([]));
  });

  it("points a visitor at the catalogue, registration and sign-in", async () => {
    render();

    expect(screen.getByRole("link", { name: /Browse courses/ })).toHaveAttribute(
      "href",
      "/courses"
    );
    // Offered twice on purpose: once in the hero, once at the end of the page.
    const register = screen.getAllByRole("link", { name: "Create an account" });
    expect(register).toHaveLength(2);
    for (const link of register) {
      expect(link).toHaveAttribute("href", "/register");
    }
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /See the full catalogue/ })).toHaveAttribute(
      "href",
      "/courses"
    );
    await waitFor(() => expect(mockedCourses.list).toHaveBeenCalled());
  });

  it("asks the catalogue for published courses only", async () => {
    render();

    await waitFor(() => {
      expect(mockedCourses.list).toHaveBeenCalledWith(
        expect.objectContaining({ view: "catalog", limit: 3 })
      );
    });
  });

  it("previews a few published courses", async () => {
    mockedCourses.list.mockResolvedValue(
      listResult([
        makeCourse({ id: "c-1", title: "Test-Driven TypeScript", slug: "tdd-ts" }),
        makeCourse({ id: "c-2", title: "Design Basics", slug: "design-basics" }),
      ])
    );

    render();

    expect(await screen.findByText("Test-Driven TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Design Basics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Test-Driven TypeScript/ })).toHaveAttribute(
      "href",
      "/courses/tdd-ts"
    );
  });

  it("says so when nothing is published yet", async () => {
    render();

    expect(await screen.findByText("No courses are published yet.")).toBeInTheDocument();
  });

  it("still renders if the catalogue request fails", async () => {
    mockedCourses.list.mockRejectedValue(new Error("network"));

    render();

    // The page is not blocked on a nicety.
    expect(await screen.findByText("No courses are published yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse courses/ })).toBeInTheDocument();
  });

  it("sends a typed certificate code to the public verification page", async () => {
    renderWithRoutes();

    const field = screen.getByLabelText("Verification code or certificate number");
    const submit = screen.getByRole("button", { name: "Verify" });

    // Nothing to verify yet.
    expect(submit).toBeDisabled();

    await userEvent.type(field, "  LMS-2026-000001  ");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    // Trimmed on the way through — a code pasted with stray spaces still works.
    expect(await screen.findByText("verifying: LMS-2026-000001")).toBeInTheDocument();
  });

  it("encodes a code with awkward characters rather than breaking the URL", async () => {
    renderWithRoutes();

    await userEvent.type(
      screen.getByLabelText("Verification code or certificate number"),
      "a/b?c"
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    // A slash would otherwise split the path into two segments and 404.
    expect(await screen.findByText("verifying: a/b?c")).toBeInTheDocument();
  });

  it("describes what the product does without overpromising", () => {
    render();

    expect(screen.getByText("What you get")).toBeInTheDocument();
    expect(screen.getByText("Certificates that verify")).toBeInTheDocument();
    // Registration creates a student; the page says so rather than implying more.
    expect(screen.getByText(/gets you a student profile/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the help pages/ })).toHaveAttribute(
      "href",
      "/help"
    );
  });
});
