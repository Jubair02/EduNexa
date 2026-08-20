import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentPanel } from "@/components/courses/EnrollmentPanel";
import { MyCoursesPage } from "@/pages/student/MyCoursesPage";
import { StudentDashboard } from "@/pages/student/StudentDashboard";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { progressService } from "@/services/progress.service";
import type { Enrollment, Pagination } from "@/types";
import { makeCourse, makeUser, renderWithProviders } from "./helpers";

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

// The student dashboard also pulls the catalog to build recommendations.
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

// Learning statistics come from the progress service — asserted in detail by
// Progress.test.tsx; here it only needs to resolve.
vi.mock("@/services/progress.service", () => ({
  progressService: {
    setLessonProgress: vi.fn(),
    getLessonProgress: vi.fn(),
    getCourseProgress: vi.fn(),
    myCourses: vi.fn(),
  },
}));

// Certificates appear on the dashboard too; covered in detail by Certificate.test.tsx.
vi.mock("@/services/certificates.service", () => ({
  certificatesService: {
    list: vi.fn(),
    get: vi.fn(),
    download: vi.fn(),
    verify: vi.fn(),
    setStatus: vi.fn(),
    courseCompletionStatistics: vi.fn(),
  },
}));

const mocked = vi.mocked(enrollmentsService);
const mockedCourses = vi.mocked(coursesService);
const mockedProgress = vi.mocked(progressService);
const mockedCertificates = vi.mocked(certificatesService);

let idCounter = 0;

const makeEnrollment = (overrides: Partial<Enrollment> = {}): Enrollment => {
  idCounter += 1;
  return {
    id: `enrollment-${idCounter}`,
    status: "active",
    enrolledAt: "2026-08-19T10:00:00.000Z",
    course: {
      id: `course-${idCounter}`,
      title: `Enrolled Course ${idCounter}`,
      slug: `enrolled-course-${idCounter}`,
      category: "programming",
      level: "beginner",
      status: "published",
      instructorName: "Ina Structor",
    },
    student: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
};

const listResult = (enrollments: Enrollment[], pagination?: Partial<Pagination>) => ({
  enrollments,
  pagination: {
    page: 1,
    limit: 9,
    total: enrollments.length,
    totalPages: 1,
    ...pagination,
  },
});

const student = makeUser({ role: "student", firstName: "Study" });

describe("EnrollmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enrolls through the confirmation dialog and switches to Continue Learning", async () => {
    mocked.check.mockResolvedValue({ isEnrolled: false, enrollmentId: null, status: null });
    mocked.enroll.mockResolvedValue(makeEnrollment({ id: "new-enrollment" }));

    renderWithProviders(<EnrollmentPanel courseId="course-1" />, { authUser: student });

    await userEvent.click(await screen.findByRole("button", { name: /Enroll Now/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "You will get access to the available course content after enrollment."
      )
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirm Enrollment" })
    );

    await waitFor(() => {
      expect(mocked.enroll).toHaveBeenCalledWith("course-1");
    });
    expect(await screen.findByText("Successfully enrolled in course")).toBeInTheDocument();
    expect(screen.getByText("You are enrolled in this course.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue Learning/ })).toHaveAttribute(
      "href",
      "/student/courses/course-1/learn"
    );
    expect(screen.queryByRole("button", { name: /Enroll Now/ })).not.toBeInTheDocument();
  });

  it("shows Continue Learning when already enrolled", async () => {
    mocked.check.mockResolvedValue({
      isEnrolled: true,
      enrollmentId: "e-1",
      status: "active",
    });

    renderWithProviders(<EnrollmentPanel courseId="course-1" />, { authUser: student });

    expect(
      await screen.findByText("You are enrolled in this course.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enroll Now/ })).not.toBeInTheDocument();
  });

  it("offers re-enrollment for a cancelled enrollment", async () => {
    mocked.check.mockResolvedValue({
      isEnrolled: false,
      enrollmentId: "e-1",
      status: "cancelled",
    });
    mocked.enroll.mockResolvedValue(makeEnrollment());

    renderWithProviders(<EnrollmentPanel courseId="course-1" />, { authUser: student });

    expect(await screen.findByText("Your enrollment is cancelled.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-enroll" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirm Enrollment" })
    );

    await waitFor(() => {
      expect(mocked.enroll).toHaveBeenCalledWith("course-1");
    });
  });

  it("shows nothing for admins and a sign-in prompt for visitors", async () => {
    mocked.check.mockResolvedValue({ isEnrolled: false, enrollmentId: null, status: null });

    renderWithProviders(<EnrollmentPanel courseId="course-1" />, {
      authUser: makeUser({ role: "admin" }),
    });
    expect(screen.queryByRole("button", { name: /Enroll Now/ })).not.toBeInTheDocument();
    expect(mocked.check).not.toHaveBeenCalled();

    renderWithProviders(<EnrollmentPanel courseId="course-1" />, { authUser: null });
    expect(
      screen.getByText("Sign in as a student to enroll in this course.")
    ).toBeInTheDocument();
  });
});

describe("MyCoursesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders enrolled course cards with enrollment info", async () => {
    mocked.myCourses.mockResolvedValue(
      listResult([makeEnrollment({ status: "active" })])
    );

    renderWithProviders(<MyCoursesPage />, { authUser: student });

    expect(await screen.findByText(/Enrolled Course/)).toBeInTheDocument();
    expect(screen.getByText("Ina Structor")).toBeInTheDocument();
    expect(screen.getByText(/Enrolled:/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue Learning/ })).toBeInTheDocument();
  });

  it("shows the empty state with a browse link", async () => {
    mocked.myCourses.mockResolvedValue(listResult([]));

    renderWithProviders(<MyCoursesPage />, { authUser: student });

    expect(
      await screen.findByText("You haven't enrolled in any courses yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Courses" })).toBeInTheDocument();
  });

  it("cancels an enrollment after confirmation", async () => {
    const enrollment = makeEnrollment({ status: "active" });
    mocked.myCourses.mockResolvedValue(listResult([enrollment]));
    mocked.cancel.mockResolvedValue({ ...enrollment, status: "cancelled" });

    renderWithProviders(<MyCoursesPage />, { authUser: student });

    await userEvent.click(await screen.findByText("Cancel enrollment"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel enrollment" })
    );

    await waitFor(() => {
      expect(mocked.cancel).toHaveBeenCalledWith(enrollment.id);
    });
    expect(await screen.findByText("Enrollment cancelled")).toBeInTheDocument();
  });

  it("shows Re-enroll on cancelled cards and filters by status", async () => {
    mocked.myCourses.mockResolvedValue(
      listResult([makeEnrollment({ status: "cancelled" })])
    );
    mocked.enroll.mockResolvedValue(makeEnrollment());

    renderWithProviders(<MyCoursesPage />, { authUser: student });

    expect(await screen.findByRole("button", { name: "Re-enroll" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue Learning/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by enrollment status"),
      "cancelled"
    );
    await waitFor(() => {
      expect(mocked.myCourses).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "cancelled", page: 1 })
      );
    });
  });
});

describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCourses.list.mockResolvedValue({
      courses: [],
      pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
    });
    mockedProgress.myCourses.mockResolvedValue({
      courses: [],
      summary: {
        activeCourses: 1,
        completedCourses: 0,
        overallProgressPercentage: 0,
        averageQuizScore: null,
        quizzesAttempted: 0,
      },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    mockedCertificates.list.mockResolvedValue({
      certificates: [],
      pagination: { page: 1, limit: 3, total: 0, totalPages: 0 },
    });
  });

  const mockEnrollments = (list: Enrollment[] = []): void => {
    mocked.myCourses.mockImplementation(async () => listResult(list));
  };

  it("greets the student and lists what to continue", async () => {
    mockEnrollments([makeEnrollment({ status: "active" })]);

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("Welcome back, Study")).toBeInTheDocument();
    expect(screen.getByText("Continue Learning")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Continue/ }).length).toBeGreaterThan(0);
  });

  it("derives recent activity from enrollment timestamps", async () => {
    mockEnrollments([
      makeEnrollment({
        status: "active",
        lastAccessedAt: new Date().toISOString(),
        course: {
          id: "c-9",
          title: "Timestamped Course",
          slug: "timestamped-course",
          category: "programming",
          level: "beginner",
          status: "published",
          instructorName: "Ina Structor",
        },
      }),
    ]);

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText(/Opened/)).toBeInTheDocument();
    expect(screen.getAllByText("Timestamped Course").length).toBeGreaterThan(0);
  });

  it("recommends published courses the student isn't enrolled in", async () => {
    mockEnrollments();
    mockedCourses.list.mockResolvedValue({
      courses: [
        makeCourse({ title: "Fresh Recommendation", status: "published" }),
      ],
      pagination: { page: 1, limit: 9, total: 1, totalPages: 1 },
    });

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(await screen.findByText("Recommended Courses")).toBeInTheDocument();
    expect(screen.getByText("Fresh Recommendation")).toBeInTheDocument();
  });

  it("shows the empty state when nothing is enrolled", async () => {
    mockEnrollments();

    renderWithProviders(<StudentDashboard />, { authUser: student });

    expect(
      await screen.findByText("You haven't enrolled in any courses yet.")
    ).toBeInTheDocument();
  });
});
