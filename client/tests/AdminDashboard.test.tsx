import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { usersService } from "@/services/users.service";
import { makeAdmin, makeUser, renderWithProviders } from "./helpers";

vi.mock("@/services/users.service", () => ({
  usersService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    remove: vi.fn(),
    statistics: vi.fn(),
    recent: vi.fn(),
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

const mockedService = vi.mocked(usersService);
const mockedCourses = vi.mocked(coursesService);

const courseStats = { totalCourses: 42, published: 30, draft: 10, archived: 2 };

const stats = {
  totalUsers: 1240,
  students: 980,
  instructors: 85,
  admins: 5,
  activeUsers: 1180,
  inactiveUsers: 60,
};

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.statistics.mockResolvedValue(courseStats);
    vi.mocked(enrollmentsService).statistics.mockResolvedValue({
      totalEnrollments: 7,
      activeEnrollments: 6,
      completedEnrollments: 0,
      cancelledEnrollments: 1,
    });
  });

  it("renders KPI cards from the statistics API", async () => {
    mockedService.statistics.mockResolvedValue(stats);
    mockedService.recent.mockResolvedValue([]);

    renderWithProviders(<AdminDashboard />, { authUser: makeAdmin({ firstName: "Rana" }) });

    expect(await screen.findByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("980")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("1,180")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    expect(screen.getByText("Welcome, Rana")).toBeInTheDocument();
  });

  it("renders course KPI cards", async () => {
    mockedService.statistics.mockResolvedValue(stats);
    mockedService.recent.mockResolvedValue([]);

    renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText("Total Courses")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Published Courses")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Draft Courses")).toBeInTheDocument();
    expect(screen.getByText("Archived Courses")).toBeInTheDocument();
  });

  it("lists recently registered users", async () => {
    mockedService.statistics.mockResolvedValue(stats);
    mockedService.recent.mockResolvedValue([
      makeUser({ firstName: "Newest", lastName: "Member", email: "newest@example.com" }),
    ]);

    renderWithProviders(<AdminDashboard />);

    expect(await screen.findByText("Newest Member")).toBeInTheDocument();
    expect(screen.getByText("newest@example.com")).toBeInTheDocument();
  });

  it("shows an error state with retry when loading fails", async () => {
    mockedService.statistics.mockRejectedValueOnce(new Error("boom"));
    mockedService.recent.mockRejectedValueOnce(new Error("boom"));
    mockedService.statistics.mockResolvedValueOnce(stats);
    mockedService.recent.mockResolvedValueOnce([]);

    renderWithProviders(<AdminDashboard />);

    expect(
      await screen.findByText(/Unable to load dashboard data/)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1,240")).toBeInTheDocument();
  });
});
