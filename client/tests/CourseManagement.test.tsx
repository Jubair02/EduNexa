import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseManagement } from "@/components/courses/CourseManagement";
import { coursesService } from "@/services/courses.service";
import type { Course, Pagination } from "@/types";
import { makeAdmin, makeCourse, makeUser, renderWithProviders } from "./helpers";

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

const mockedService = vi.mocked(coursesService);

const listResult = (courses: Course[], pagination?: Partial<Pagination>) => ({
  courses,
  pagination: {
    page: 1,
    limit: 10,
    total: courses.length,
    totalPages: 1,
    ...pagination,
  },
});

describe("CourseManagement (admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads courses in manage view and shows the instructor column", async () => {
    mockedService.list.mockResolvedValue(
      listResult([makeCourse({ title: "React Fundamentals" })])
    );

    renderWithProviders(<CourseManagement variant="admin" />, {
      authUser: makeAdmin(),
    });

    expect((await screen.findAllByText("React Fundamentals")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ina Structor").length).toBeGreaterThan(0);
    expect(mockedService.list).toHaveBeenCalledWith(
      expect.objectContaining({ view: "manage" })
    );
  });

  it("shows the empty state and the error state with retry", async () => {
    mockedService.list.mockRejectedValueOnce(new Error("boom"));
    mockedService.list.mockResolvedValueOnce(listResult([]));

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });

    expect(await screen.findByText("Unable to load courses.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No courses found.")).toBeInTheDocument();
  });

  it("sends search and filters to the API", async () => {
    mockedService.list.mockResolvedValue(listResult([]));

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });
    await screen.findByText("No courses found.");

    await userEvent.type(screen.getByLabelText("Search courses"), "react");
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "react", page: 1 })
      );
    });

    await userEvent.selectOptions(screen.getByLabelText("Filter by category"), "design");
    await userEvent.selectOptions(screen.getByLabelText("Filter by status"), "published");
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: "design", status: "published" })
      );
    });
  });

  it("paginates", async () => {
    mockedService.list.mockResolvedValue(
      listResult([makeCourse()], { total: 25, totalPages: 3, page: 1 })
    );

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });
    await screen.findByText(/page 1 of 3/);

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => {
      expect(mockedService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it("publishes a draft course and shows a toast", async () => {
    const course = makeCourse({ title: "Draft Course", status: "draft" });
    mockedService.list.mockResolvedValue(listResult([course]));
    mockedService.setStatus.mockResolvedValue({ ...course, status: "published" });

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });
    await screen.findAllByText("Draft Course");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Publish Draft Course" })[0]
    );

    await waitFor(() => {
      expect(mockedService.setStatus).toHaveBeenCalledWith(course.id, "published");
    });
    expect(await screen.findByText("Course published")).toBeInTheDocument();
  });

  it("archives a course after confirmation", async () => {
    const course = makeCourse({ title: "Live Course", status: "published" });
    mockedService.list.mockResolvedValue(listResult([course]));
    mockedService.setStatus.mockResolvedValue({ ...course, status: "archived" });

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });
    await screen.findAllByText("Live Course");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Archive Live Course" })[0]
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(mockedService.setStatus).toHaveBeenCalledWith(course.id, "archived");
    });
    expect(await screen.findByText("Course archived")).toBeInTheDocument();
  });

  it("deletes a course after confirmation", async () => {
    const course = makeCourse({ title: "Doomed Course" });
    mockedService.list.mockResolvedValue(listResult([course]));
    mockedService.remove.mockResolvedValue(undefined);

    renderWithProviders(<CourseManagement variant="admin" />, { authUser: makeAdmin() });
    await screen.findAllByText("Doomed Course");

    await userEvent.click(
      screen.getAllByRole("button", { name: "Delete Doomed Course" })[0]
    );
    expect(
      await screen.findByText(/Are you sure you want to delete "Doomed Course"/)
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete course" }));

    await waitFor(() => {
      expect(mockedService.remove).toHaveBeenCalledWith(course.id);
    });
    expect(await screen.findByText("Course deleted")).toBeInTheDocument();
  });
});

describe("CourseManagement (instructor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the instructor column and hides delete for published courses", async () => {
    const instructor = makeUser({ role: "instructor", id: "instructor-1" });
    mockedService.list.mockResolvedValue(
      listResult([
        makeCourse({ title: "My Published", status: "published" }),
        makeCourse({ title: "My Draft", status: "draft" }),
      ])
    );

    renderWithProviders(<CourseManagement variant="instructor" />, {
      authUser: instructor,
    });

    await screen.findAllByText("My Published");
    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete My Published" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Delete My Draft" }).length
    ).toBeGreaterThan(0);
  });
});
