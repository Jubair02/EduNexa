import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEnrollmentsPage } from "@/pages/admin/AdminEnrollmentsPage";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import type { Enrollment, EnrollmentStatus } from "@/types";
import { makeAdmin, renderWithProviders } from "./helpers";

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

const mockedEnrollments = vi.mocked(enrollmentsService);
const mockedCourses = vi.mocked(coursesService);

let counter = 0;

const makeEnrollment = (overrides: Partial<Enrollment> = {}): Enrollment => {
  counter += 1;
  return {
    id: `e-${counter}`,
    status: "active" as EnrollmentStatus,
    enrolledAt: "2026-08-10T10:00:00.000Z",
    lastAccessedAt: "2026-08-18T12:00:00.000Z",
    course: {
      id: "68b0000000000000000000c1",
      title: "Records Keeping",
      slug: "records-keeping",
      category: "programming",
      level: "beginner",
      status: "published",
      instructorName: "Ina Structor",
    },
    student: {
      id: "s-1",
      firstName: "Nadia",
      lastName: "Okonjo",
      email: "nadia@example.com",
    },
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
};

const stats = {
  totalEnrollments: 128,
  activeEnrollments: 94,
  completedEnrollments: 27,
  cancelledEnrollments: 7,
};

const listResult = (
  enrollments: Enrollment[],
  pagination?: Partial<{ page: number; limit: number; total: number; totalPages: number }>
) => ({
  enrollments,
  pagination: {
    page: 1,
    limit: 10,
    total: enrollments.length,
    totalPages: 1,
    ...pagination,
  },
});

const renderAt = (url = "/admin/enrollments") =>
  renderWithProviders(<AdminEnrollmentsPage />, {
    authUser: makeAdmin(),
    initialEntries: [url],
  });

describe("AdminEnrollmentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    mockedEnrollments.listAll.mockResolvedValue(listResult([makeEnrollment()]));
    mockedEnrollments.statistics.mockResolvedValue(stats);
  });

  it("asks for newest enrollment first, which the server used to decide alone", async () => {
    renderAt();
    await screen.findByRole("table");

    expect(mockedEnrollments.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: "enrolledAt", sortOrder: "desc" })
    );
  });

  it("starts a date column newest-first and flips it on the second click", async () => {
    renderAt();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Last accessed" }));
    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "lastAccessedAt", sortOrder: "desc" })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Last accessed" }));
    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "lastAccessedAt", sortOrder: "asc" })
      )
    );
  });

  it("starts the text column A–Z instead, since newest means nothing there", async () => {
    renderAt();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Status" }));
    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "status", sortOrder: "asc" })
      )
    );
  });

  it("exposes the sorted column to assistive technology", async () => {
    renderAt("/admin/enrollments?sortBy=status&sortOrder=asc");
    await screen.findByRole("table");

    expect(screen.getByRole("columnheader", { name: /Status/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
    // Only the active column is marked; the others must not claim an order.
    expect(screen.getByRole("columnheader", { name: /Enrolled/ })).toHaveAttribute(
      "aria-sort",
      "none"
    );
  });

  it("turns the counts into the filters they describe", async () => {
    renderAt();
    await screen.findByRole("table");

    const completed = await screen.findByRole("button", { name: /27\s*Completed/ });
    expect(completed).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(completed);

    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "completed" })
      )
    );
    expect(
      await screen.findByRole("button", { name: /27\s*Completed/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the table when the counts fail to load", async () => {
    mockedEnrollments.statistics.mockRejectedValue(new Error("stats down"));
    renderAt();

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Completed/ })).not.toBeInTheDocument();
  });

  it("cancels an enrollment after confirmation and reports it", async () => {
    const target = makeEnrollment({ status: "active" });
    mockedEnrollments.listAll.mockResolvedValue(listResult([target]));
    mockedEnrollments.cancel.mockResolvedValue({ ...target, status: "cancelled" });

    renderAt();
    await screen.findByRole("table");

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Cancel enrollment for Nadia Okonjo",
      })[0]
    );

    expect(await screen.findByText(/will lose access to Records Keeping/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel enrollment" }));

    await waitFor(() => expect(mockedEnrollments.cancel).toHaveBeenCalledWith(target.id));
    expect(await screen.findByText("Enrollment cancelled")).toBeInTheDocument();
  });

  it("offers nothing to cancel on an already-cancelled enrollment", async () => {
    mockedEnrollments.listAll.mockResolvedValue(
      listResult([makeEnrollment({ status: "cancelled" })])
    );

    renderAt();
    await screen.findByRole("table");

    expect(
      screen.queryByRole("button", { name: /Cancel enrollment for/ })
    ).not.toBeInTheDocument();
  });

  it("reports a failed cancellation instead of pretending it worked", async () => {
    mockedEnrollments.cancel.mockRejectedValue(new Error("Enrollment not found"));

    renderAt();
    await screen.findByRole("table");

    await userEvent.click(
      screen.getAllByRole("button", { name: /Cancel enrollment for/ })[0]
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel enrollment" }));

    expect(await screen.findByText("Enrollment not found")).toBeInTheDocument();
  });

  it("restores the whole view from the URL", async () => {
    renderAt(
      "/admin/enrollments?search=nadia&status=active&course=68b0000000000000000000c1&sortBy=lastAccessedAt&sortOrder=asc&limit=25&page=2"
    );
    await screen.findByRole("table");

    expect(mockedEnrollments.listAll).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      search: "nadia",
      status: "active",
      course: "68b0000000000000000000c1",
      sortBy: "lastAccessedAt",
      sortOrder: "asc",
    });
  });

  it("discards URL values the server would reject", async () => {
    renderAt(
      "/admin/enrollments?status=abandoned&course=not-an-object-id&sortBy=student&limit=9999&page=0"
    );
    await screen.findByRole("table");

    expect(mockedEnrollments.listAll).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "",
        course: undefined,
        sortBy: "enrolledAt",
        limit: 10,
        page: 1,
      })
    );
  });

  it("lets an admin change how many rows a page holds", async () => {
    renderAt();
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "50");

    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, page: 1 })
      )
    );
  });

  it("offers a way out of a filtered-to-nothing list", async () => {
    mockedEnrollments.listAll.mockResolvedValue(listResult([]));
    renderAt("/admin/enrollments?status=cancelled");

    await screen.findByText("No enrollments found.");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() =>
      expect(mockedEnrollments.listAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "", search: "", course: undefined })
      )
    );
  });

  it("shows no clear-filters escape hatch when nothing is filtered", async () => {
    mockedEnrollments.listAll.mockResolvedValue(listResult([]));
    renderAt();

    await screen.findByText("No enrollments found.");
    expect(
      screen.queryByRole("button", { name: "Clear filters" })
    ).not.toBeInTheDocument();
  });

  it("names the range on show, not just the page number", async () => {
    mockedEnrollments.listAll.mockResolvedValue(
      listResult([makeEnrollment()], { page: 3, limit: 10, total: 128, totalPages: 13 })
    );
    renderAt("/admin/enrollments?page=3");

    expect(await screen.findByText(/21–30 of 128 enrollments/)).toBeInTheDocument();
  });

  it("still reads a deleted student and course without breaking the row", async () => {
    mockedEnrollments.listAll.mockResolvedValue(
      listResult([makeEnrollment({ student: null, course: null })])
    );

    renderAt();
    const table = await screen.findByRole("table");

    expect(within(table).getByText("Deleted user")).toBeInTheDocument();
    expect(within(table).getByText("Deleted course")).toBeInTheDocument();
  });
});
