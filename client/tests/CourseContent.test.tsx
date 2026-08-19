import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseContentManager } from "@/components/courses/CourseContentManager";
import { CourseContentTree } from "@/components/courses/CourseContentTree";
import { lessonsService } from "@/services/lessons.service";
import { modulesService } from "@/services/modules.service";
import type { CourseModule, Lesson, LessonSummary } from "@/types";
import { makeAdmin, renderWithProviders } from "./helpers";

vi.mock("@/services/modules.service", () => ({
  modulesService: {
    listByCourse: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setStatus: vi.fn(),
    reorder: vi.fn(),
  },
}));

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

const mockedModules = vi.mocked(modulesService);
const mockedLessons = vi.mocked(lessonsService);

let idCounter = 0;

const makeModule = (overrides: Partial<CourseModule> = {}): CourseModule => {
  idCounter += 1;
  return {
    id: `module-${idCounter}`,
    course: "course-1",
    title: `Module ${idCounter}`,
    order: idCounter,
    isPublished: false,
    lessonCount: 0,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
};

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => {
  idCounter += 1;
  return {
    id: `lesson-${idCounter}`,
    module: "module-1",
    course: "course-1",
    title: `Lesson ${idCounter}`,
    type: "text",
    content: "Lesson body content.",
    order: 1,
    isPublished: false,
    isPreview: false,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
};

describe("CourseContentManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it("shows the empty state when the course has no modules", async () => {
    mockedModules.listByCourse.mockResolvedValue([]);

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    expect(
      await screen.findByText("This course has no modules yet.")
    ).toBeInTheDocument();
  });

  it("creates a module through the modal and shows a toast", async () => {
    mockedModules.listByCourse.mockResolvedValue([]);
    mockedModules.create.mockResolvedValue(makeModule({ title: "Introduction" }));

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });
    await screen.findByText("This course has no modules yet.");

    await userEvent.click(screen.getByRole("button", { name: /Add module/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Title"), "Introduction");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add module" }));

    await waitFor(() => {
      expect(mockedModules.create).toHaveBeenCalledWith("course-1", {
        title: "Introduction",
        description: "",
      });
    });
    expect(await screen.findByText("Module created")).toBeInTheDocument();
  });

  it("expands a module, loads its lessons, and shows the no-lessons state", async () => {
    const module = makeModule({ id: "module-1", title: "Empty Module" });
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedLessons.listByModule.mockResolvedValue([]);

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Expand module Empty Module" })
    );

    expect(
      await screen.findByText("This module has no lessons yet. Add a lesson to continue.")
    ).toBeInTheDocument();
    expect(mockedLessons.listByModule).toHaveBeenCalledWith("module-1");
  });

  it("adds a video lesson with the dynamic form", async () => {
    const module = makeModule({ id: "module-1", title: "Video Module" });
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedLessons.listByModule.mockResolvedValue([]);
    mockedLessons.create.mockResolvedValue(
      makeLesson({ module: "module-1", type: "video", title: "Intro Video" })
    );

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Expand module Video Module" })
    );
    await userEvent.click(await screen.findByRole("button", { name: /Add lesson/ }));

    const dialog = await screen.findByRole("dialog");
    // Video is the default type: URL field visible, text content hidden.
    expect(within(dialog).getByLabelText("Video URL")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Text content")).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Title"), "Intro Video");
    await userEvent.type(
      within(dialog).getByLabelText("Video URL"),
      "https://youtube.com/watch?v=abc"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Add lesson" }));

    await waitFor(() => {
      expect(mockedLessons.create).toHaveBeenCalledWith(
        "module-1",
        expect.objectContaining({
          title: "Intro Video",
          type: "video",
          videoUrl: "https://youtube.com/watch?v=abc",
        })
      );
    });
    expect(await screen.findByText("Lesson created")).toBeInTheDocument();
  });

  it("switches the lesson form fields when the type changes and validates them", async () => {
    const module = makeModule({ id: "module-1", title: "Form Module" });
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedLessons.listByModule.mockResolvedValue([]);

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Expand module Form Module" })
    );
    await userEvent.click(await screen.findByRole("button", { name: /Add lesson/ }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.selectOptions(within(dialog).getByLabelText("Lesson type"), "text");
    expect(within(dialog).getByLabelText("Text content")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Video URL")).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Title"), "Text Lesson");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add lesson" }));
    expect(await screen.findByText("Write the lesson content.")).toBeInTheDocument();
    expect(mockedLessons.create).not.toHaveBeenCalled();

    await userEvent.selectOptions(within(dialog).getByLabelText("Lesson type"), "pdf");
    expect(within(dialog).getByLabelText("Upload PDF")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Or PDF file URL")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Text content")).not.toBeInTheDocument();
  });

  it("publishes a module from the tree", async () => {
    const module = makeModule({ id: "module-1", title: "Publish Me" });
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedModules.setStatus.mockResolvedValue({ ...module, isPublished: true });

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Publish module Publish Me" })
    );

    await waitFor(() => {
      expect(mockedModules.setStatus).toHaveBeenCalledWith("module-1", true);
    });
    expect(await screen.findByText("Module published")).toBeInTheDocument();
  });

  it("deletes a module after confirmation", async () => {
    const module = makeModule({ id: "module-1", title: "Doomed Module" });
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedModules.remove.mockResolvedValue(undefined);

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete module Doomed Module" })
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete module" }));

    await waitFor(() => {
      expect(mockedModules.remove).toHaveBeenCalledWith("module-1");
    });
    expect(await screen.findByText("Module deleted")).toBeInTheDocument();
  });

  it("reorders modules with the move-down control", async () => {
    const m1 = makeModule({ id: "m-1", title: "First Module", order: 1 });
    const m2 = makeModule({ id: "m-2", title: "Second Module", order: 2 });
    mockedModules.listByCourse.mockResolvedValue([m1, m2]);
    mockedModules.reorder.mockResolvedValue([
      { ...m2, order: 1 },
      { ...m1, order: 2 },
    ]);

    renderWithProviders(<CourseContentManager courseId="course-1" />, {
      authUser: makeAdmin(),
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Move module First Module down" })
    );

    await waitFor(() => {
      expect(mockedModules.reorder).toHaveBeenCalledWith("course-1", ["m-2", "m-1"]);
    });
    expect(await screen.findByText("Modules reordered")).toBeInTheDocument();
  });
});

describe("CourseContentTree (student view)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
  });

  it("renders published modules with lesson links and preview badges", async () => {
    const module = makeModule({
      id: "module-1",
      title: "Visible Module",
      isPublished: true,
      lessonCount: 2,
    });
    const lessons: LessonSummary[] = [
      makeLesson({ id: "l-1", title: "Open Lesson", isPublished: true }),
      makeLesson({
        id: "l-2",
        title: "Preview Lesson",
        isPublished: true,
        isPreview: true,
      }),
    ];
    mockedModules.listByCourse.mockResolvedValue([module]);
    mockedLessons.listByModule.mockResolvedValue(lessons);

    renderWithProviders(
      <CourseContentTree courseId="course-1" courseSlug="visible-course" />,
      { authUser: null }
    );

    expect(await screen.findByText("Visible Module")).toBeInTheDocument();
    expect(screen.getByText("Open Lesson")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Open Lesson").closest("a")).toHaveAttribute(
      "href",
      "/courses/visible-course/lessons/l-1"
    );
  });

  it("shows a friendly message when nothing is published", async () => {
    mockedModules.listByCourse.mockResolvedValue([]);

    renderWithProviders(
      <CourseContentTree courseId="course-1" courseSlug="empty-course" />,
      { authUser: null }
    );

    expect(
      await screen.findByText("Course content is being prepared — check back soon.")
    ).toBeInTheDocument();
  });
});
