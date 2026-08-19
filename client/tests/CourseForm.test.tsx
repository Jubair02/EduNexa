import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseForm } from "@/components/courses/CourseForm";
import { coursesService } from "@/services/courses.service";
import { usersService } from "@/services/users.service";
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

const mockedCourses = vi.mocked(coursesService);
const mockedUsers = vi.mocked(usersService);

describe("CourseForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUsers.list.mockResolvedValue({
      users: [makeUser({ id: "inst-9", role: "instructor", firstName: "Pick", lastName: "Me" })],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  it("validates required fields on create", async () => {
    renderWithProviders(
      <CourseForm variant="instructor" onSaved={() => {}} onCancel={() => {}} />,
      { authUser: makeUser({ role: "instructor" }) }
    );

    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    expect(await screen.findByText("Enter a course title.")).toBeInTheDocument();
    expect(screen.getByText("Describe the course.")).toBeInTheDocument();
    expect(mockedCourses.create).not.toHaveBeenCalled();
  });

  it("instructor variant never sends an instructor id and shows themselves read-only", async () => {
    const instructor = makeUser({
      role: "instructor",
      firstName: "Self",
      lastName: "Taught",
    });
    const created = makeCourse({ title: "My New Course" });
    mockedCourses.create.mockResolvedValue(created);
    const onSaved = vi.fn();

    renderWithProviders(
      <CourseForm variant="instructor" onSaved={onSaved} onCancel={() => {}} />,
      { authUser: instructor }
    );

    expect(screen.getByDisplayValue("Self Taught (you)")).toBeDisabled();
    expect(mockedUsers.list).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Title"), "My New Course");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A description long enough to pass validation."
    );
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => {
      expect(mockedCourses.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ instructor: expect.anything() })
      );
    });
    expect(onSaved).toHaveBeenCalledWith(created, "created");
  });

  it("admin variant requires choosing an instructor and sends it", async () => {
    const created = makeCourse();
    mockedCourses.create.mockResolvedValue(created);

    renderWithProviders(
      <CourseForm variant="admin" onSaved={() => {}} onCancel={() => {}} />,
      { authUser: makeAdmin() }
    );

    await userEvent.type(screen.getByLabelText("Title"), "Admin Made Course");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A description long enough to pass validation."
    );
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));
    expect(await screen.findByText("Choose an instructor.")).toBeInTheDocument();

    await screen.findByRole("option", { name: /Pick Me/ });
    await userEvent.selectOptions(screen.getByLabelText("Instructor"), "inst-9");
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    await waitFor(() => {
      expect(mockedCourses.create).toHaveBeenCalledWith(
        expect.objectContaining({ instructor: "inst-9" })
      );
    });
  });

  it("edit mode pre-fills and updates the course", async () => {
    const course = makeCourse({ title: "Before Title", category: "design" });
    mockedCourses.update.mockResolvedValue({ ...course, title: "After Title" });
    const onSaved = vi.fn();

    renderWithProviders(
      <CourseForm
        variant="instructor"
        course={course}
        onSaved={onSaved}
        onCancel={() => {}}
      />,
      { authUser: makeUser({ role: "instructor", id: "instructor-1" }) }
    );

    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Before Title");
    expect(screen.getByLabelText("Category")).toHaveValue("design");

    await userEvent.clear(title);
    await userEvent.type(title, "After Title");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedCourses.update).toHaveBeenCalledWith(
        course.id,
        expect.objectContaining({ title: "After Title" })
      );
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ title: "After Title" }),
      "updated"
    );
  });

  it("rejects an invalid duration", async () => {
    renderWithProviders(
      <CourseForm variant="instructor" onSaved={() => {}} onCancel={() => {}} />,
      { authUser: makeUser({ role: "instructor" }) }
    );

    await userEvent.type(screen.getByLabelText("Title"), "Valid Title");
    await userEvent.type(
      screen.getByLabelText("Description"),
      "A description long enough to pass validation."
    );
    await userEvent.type(screen.getByLabelText("Duration (minutes)"), "-5");
    await userEvent.click(screen.getByRole("button", { name: "Create course" }));

    expect(
      await screen.findByText("Duration must be a positive number of minutes.")
    ).toBeInTheDocument();
  });
});
