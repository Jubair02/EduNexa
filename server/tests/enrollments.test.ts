import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { Enrollment, EnrollmentStatus } from "../src/models/enrollment.model";
import { Lesson, LessonType } from "../src/models/lesson.model";
import { Module } from "../src/models/module.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUserWithToken = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Enr",
    lastName: `${role}${counter}`,
    email: `enr-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const createCourseInDb = async (
  instructorId: string,
  overrides: Record<string, unknown> = {}
) =>
  Course.create({
    title: `Enrollable Course ${++counter}`,
    slug: `enrollable-${counter}`,
    description: "A course used by enrollment tests.",
    category: "programming",
    level: "beginner",
    instructor: instructorId,
    status: CourseStatus.PUBLISHED,
    ...overrides,
  });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Published course with one published module holding a protected and a preview lesson. */
const createLearnableCourse = async () => {
  const owner = await createUserWithToken(UserRole.INSTRUCTOR);
  const course = await createCourseInDb(owner.user._id.toString());
  const module = await Module.create({
    course: course._id,
    title: "Learn Module",
    order: 1,
    isPublished: true,
  });
  const protectedLesson = await Lesson.create({
    module: module._id,
    course: course._id,
    title: "Protected Lesson",
    type: LessonType.TEXT,
    content: "Secret course body.",
    order: 1,
    isPublished: true,
    isPreview: false,
  });
  const previewLesson = await Lesson.create({
    module: module._id,
    course: course._id,
    title: "Preview Lesson",
    type: LessonType.TEXT,
    content: "Open preview body.",
    order: 2,
    isPublished: true,
    isPreview: true,
  });
  return { owner, course, module, protectedLesson, previewLesson };
};

describe("POST /api/courses/:courseId/enroll", () => {
  it("enrolls a student with the authenticated id, ignoring any body payload", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const other = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token))
      .send({ studentId: other.user._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Successfully enrolled in course");
    expect(res.body.data.enrollment.status).toBe("active");
    expect(res.body.data.enrollment.enrolledAt).toBeDefined();

    const stored = await Enrollment.findOne({ course: course._id });
    expect(stored?.student.toString()).toBe(student.user._id.toString());
  });

  it("rejects duplicate enrollment", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const url = `/api/courses/${course._id.toString()}/enroll`;

    await request(app).post(url).set(auth(student.token));
    const dup = await request(app).post(url).set(auth(student.token));

    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe("You are already enrolled in this course.");
    expect(await Enrollment.countDocuments({ course: course._id })).toBe(1);
  });

  it.each([[CourseStatus.DRAFT], [CourseStatus.ARCHIVED]])(
    "rejects enrollment into a %s course",
    async (status) => {
      const owner = await createUserWithToken(UserRole.INSTRUCTOR);
      const course = await createCourseInDb(owner.user._id.toString(), { status });
      const student = await createUserWithToken(UserRole.STUDENT);

      const res = await request(app)
        .post(`/api/courses/${course._id.toString()}/enroll`)
        .set(auth(student.token));

      expect(res.status).toBe(400);
      expect(await Enrollment.countDocuments()).toBe(0);
    }
  );

  it("rejects non-students and unauthenticated users", async () => {
    const { course, owner } = await createLearnableCourse();
    const admin = await createUserWithToken(UserRole.ADMIN);
    const url = `/api/courses/${course._id.toString()}/enroll`;

    const asInstructor = await request(app).post(url).set(auth(owner.token));
    const asAdmin = await request(app).post(url).set(auth(admin.token));
    const anonymous = await request(app).post(url);

    expect(asInstructor.status).toBe(403);
    expect(asAdmin.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it("rejects invalid and missing course ids", async () => {
    const student = await createUserWithToken(UserRole.STUDENT);

    const invalid = await request(app)
      .post("/api/courses/not-an-id/enroll")
      .set(auth(student.token));
    const missing = await request(app)
      .post("/api/courses/64b2fa8a0f1b2c3d4e5f6a7b/enroll")
      .set(auth(student.token));

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  it("reactivates a cancelled enrollment instead of creating a second record", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const url = `/api/courses/${course._id.toString()}/enroll`;

    const first = await request(app).post(url).set(auth(student.token));
    const enrollmentId = first.body.data.enrollment.id as string;

    await request(app)
      .delete(`/api/enrollments/${enrollmentId}`)
      .set(auth(student.token));

    const again = await request(app).post(url).set(auth(student.token));

    expect(again.status).toBe(201);
    expect(again.body.data.enrollment.id).toBe(enrollmentId);
    expect(again.body.data.enrollment.status).toBe("active");
    expect(await Enrollment.countDocuments({ course: course._id })).toBe(1);
  });
});

describe("GET /api/courses/:courseId/enrollment", () => {
  it("reports enrollment state for the authenticated student", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const url = `/api/courses/${course._id.toString()}/enrollment`;

    const before = await request(app).get(url).set(auth(student.token));
    expect(before.body.data).toEqual({
      isEnrolled: false,
      enrollmentId: null,
      status: null,
    });

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const enrollmentId = enroll.body.data.enrollment.id;

    const after = await request(app).get(url).set(auth(student.token));
    expect(after.body.data).toEqual({
      isEnrolled: true,
      enrollmentId,
      status: "active",
    });

    await request(app)
      .delete(`/api/enrollments/${enrollmentId}`)
      .set(auth(student.token));

    const cancelled = await request(app).get(url).set(auth(student.token));
    expect(cancelled.body.data).toEqual({
      isEnrolled: false,
      enrollmentId,
      status: "cancelled",
    });
  });
});

describe("DELETE /api/enrollments/:id (cancel)", () => {
  it("cancels without deleting the record", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const id = enroll.body.data.enrollment.id;

    const res = await request(app)
      .delete(`/api/enrollments/${id}`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Enrollment cancelled");
    const stored = await Enrollment.findById(id);
    expect(stored?.status).toBe(EnrollmentStatus.CANCELLED);
  });

  it("blocks a student from cancelling another student's enrollment", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const intruder = await createUserWithToken(UserRole.STUDENT);

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const id = enroll.body.data.enrollment.id;

    const res = await request(app)
      .delete(`/api/enrollments/${id}`)
      .set(auth(intruder.token));

    expect(res.status).toBe(404);
    expect((await Enrollment.findById(id))?.status).toBe(EnrollmentStatus.ACTIVE);
  });

  it("rejects cancelling an already-cancelled enrollment", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const id = enroll.body.data.enrollment.id;

    await request(app).delete(`/api/enrollments/${id}`).set(auth(student.token));
    const second = await request(app)
      .delete(`/api/enrollments/${id}`)
      .set(auth(student.token));

    expect(second.status).toBe(400);
  });
});

describe("lesson access control", () => {
  it("grants an enrolled student access to protected lessons and records lastAccessedAt", async () => {
    const { course, protectedLesson } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));

    const res = await request(app)
      .get(`/api/lessons/${protectedLesson._id.toString()}`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.content).toBe("Secret course body.");

    const enrollment = await Enrollment.findOne({ student: student.user._id });
    expect(enrollment?.lastAccessedAt).toBeDefined();
  });

  it("blocks non-enrolled students and anonymous visitors from protected lessons", async () => {
    const { protectedLesson } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const url = `/api/lessons/${protectedLesson._id.toString()}`;

    const asStudent = await request(app).get(url).set(auth(student.token));
    const anonymous = await request(app).get(url);

    expect(asStudent.status).toBe(403);
    expect(asStudent.body.message).toBe(
      "You need to enroll in this course to access this lesson."
    );
    expect(anonymous.status).toBe(403);
  });

  it("keeps preview lessons open without enrollment", async () => {
    const { previewLesson } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);

    const asStudent = await request(app)
      .get(`/api/lessons/${previewLesson._id.toString()}`)
      .set(auth(student.token));
    const anonymous = await request(app).get(
      `/api/lessons/${previewLesson._id.toString()}`
    );

    expect(asStudent.status).toBe(200);
    expect(anonymous.status).toBe(200);
  });

  it("limits non-enrolled navigation to preview lessons only", async () => {
    const { course, module, previewLesson } = await createLearnableCourse();
    await Lesson.create({
      module: module._id,
      course: course._id,
      title: "Second Preview",
      type: LessonType.TEXT,
      content: "Another preview.",
      order: 3,
      isPublished: true,
      isPreview: true,
    });

    const res = await request(app).get(
      `/api/lessons/${previewLesson._id.toString()}`
    );

    // Previous is the protected lesson — hidden. Next is the second preview.
    expect(res.body.data.context.previousLessonId).toBeNull();
    expect(res.body.data.context.nextLessonId).not.toBeNull();
  });

  it("revokes protected access after cancellation and restores it on re-enrollment", async () => {
    const { course, protectedLesson } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const lessonUrl = `/api/lessons/${protectedLesson._id.toString()}`;

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const enrollmentId = enroll.body.data.enrollment.id;

    expect((await request(app).get(lessonUrl).set(auth(student.token))).status).toBe(200);

    await request(app)
      .delete(`/api/enrollments/${enrollmentId}`)
      .set(auth(student.token));
    expect((await request(app).get(lessonUrl).set(auth(student.token))).status).toBe(403);

    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    expect((await request(app).get(lessonUrl).set(auth(student.token))).status).toBe(200);
  });

  it("admin and owning instructor keep full access without enrollment", async () => {
    const { owner, protectedLesson } = await createLearnableCourse();
    const admin = await createUserWithToken(UserRole.ADMIN);
    const url = `/api/lessons/${protectedLesson._id.toString()}`;

    expect((await request(app).get(url).set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get(url).set(auth(owner.token))).status).toBe(200);
  });
});

describe("GET /api/enrollments/my-courses", () => {
  it("lists the student's enrollments with course and instructor info", async () => {
    const { course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));

    const res = await request(app)
      .get("/api/enrollments/my-courses")
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].course.title).toBe(course.title);
    expect(res.body.data[0].course.instructorName).toBeTruthy();
    expect(res.body.pagination.total).toBe(1);
  });

  it("supports search and status filtering", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const reactCourse = await createCourseInDb(owner.user._id.toString(), {
      title: "React Mastery",
      slug: "react-mastery",
    });
    const otherCourse = await createCourseInDb(owner.user._id.toString(), {
      title: "Cooking Basics",
      slug: "cooking-basics",
    });
    const student = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${reactCourse._id.toString()}/enroll`)
      .set(auth(student.token));
    const second = await request(app)
      .post(`/api/courses/${otherCourse._id.toString()}/enroll`)
      .set(auth(student.token));
    await request(app)
      .delete(`/api/enrollments/${second.body.data.enrollment.id}`)
      .set(auth(student.token));

    const bySearch = await request(app)
      .get("/api/enrollments/my-courses?search=react")
      .set(auth(student.token));
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data[0].course.title).toBe("React Mastery");

    const cancelled = await request(app)
      .get("/api/enrollments/my-courses?status=cancelled")
      .set(auth(student.token));
    expect(cancelled.body.data).toHaveLength(1);
    expect(cancelled.body.data[0].course.title).toBe("Cooking Basics");
  });

  it("is student-only", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .get("/api/enrollments/my-courses")
      .set(auth(admin.token));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/enrollments/:id", () => {
  it("lets the student, the course owner, and admins view it — but not strangers", async () => {
    const { owner, course } = await createLearnableCourse();
    const student = await createUserWithToken(UserRole.STUDENT);
    const stranger = await createUserWithToken(UserRole.STUDENT);
    const otherInstructor = await createUserWithToken(UserRole.INSTRUCTOR);
    const admin = await createUserWithToken(UserRole.ADMIN);

    const enroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    const url = `/api/enrollments/${enroll.body.data.enrollment.id}`;

    expect((await request(app).get(url).set(auth(student.token))).status).toBe(200);
    expect((await request(app).get(url).set(auth(owner.token))).status).toBe(200);
    expect((await request(app).get(url).set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get(url).set(auth(stranger.token))).status).toBe(404);
    expect((await request(app).get(url).set(auth(otherInstructor.token))).status).toBe(404);
  });
});

describe("GET /api/courses/:courseId/enrollments", () => {
  it("shows the owning instructor their course's students with search and status filter", async () => {
    const { course } = await createLearnableCourse();
    const owner = await Course.findById(course._id).then((c) =>
      User.findById(c?.instructor)
    );
    const ownerToken = signToken({
      userId: owner!._id.toString(),
      role: owner!.role,
    });

    const alice = await createUserWithToken(UserRole.STUDENT);
    const bob = await createUserWithToken(UserRole.STUDENT);
    await User.updateOne({ _id: alice.user._id }, { firstName: "Alice" });
    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(alice.token));
    const bobEnroll = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(bob.token));
    await request(app)
      .delete(`/api/enrollments/${bobEnroll.body.data.enrollment.id}`)
      .set(auth(bob.token));

    const all = await request(app)
      .get(`/api/courses/${course._id.toString()}/enrollments`)
      .set(auth(ownerToken));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0].student.email).toBeDefined();
    expect(all.body.data[0].student.password).toBeUndefined();

    const bySearch = await request(app)
      .get(`/api/courses/${course._id.toString()}/enrollments?search=alice`)
      .set(auth(ownerToken));
    expect(bySearch.body.data).toHaveLength(1);

    const active = await request(app)
      .get(`/api/courses/${course._id.toString()}/enrollments?status=active`)
      .set(auth(ownerToken));
    expect(active.body.data).toHaveLength(1);
  });

  it("blocks other instructors and students", async () => {
    const { course } = await createLearnableCourse();
    const otherInstructor = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const url = `/api/courses/${course._id.toString()}/enrollments`;

    expect((await request(app).get(url).set(auth(otherInstructor.token))).status).toBe(403);
    expect((await request(app).get(url).set(auth(student.token))).status).toBe(403);
  });
});

describe("GET /api/enrollments (admin) and statistics", () => {
  it("lists all enrollments with course filter, admin-only", async () => {
    const a = await createLearnableCourse();
    const b = await createLearnableCourse();
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${a.course._id.toString()}/enroll`)
      .set(auth(student.token));
    await request(app)
      .post(`/api/courses/${b.course._id.toString()}/enroll`)
      .set(auth(student.token));

    const all = await request(app).get("/api/enrollments").set(auth(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0].course).not.toBeNull();
    expect(all.body.data[0].student).not.toBeNull();

    const filtered = await request(app)
      .get(`/api/enrollments?course=${a.course._id.toString()}`)
      .set(auth(admin.token));
    expect(filtered.body.data).toHaveLength(1);

    const asStudent = await request(app)
      .get("/api/enrollments")
      .set(auth(student.token));
    expect(asStudent.status).toBe(403);
  });

  it("computes enrollment statistics for admins only", async () => {
    const { course } = await createLearnableCourse();
    const admin = await createUserWithToken(UserRole.ADMIN);
    const s1 = await createUserWithToken(UserRole.STUDENT);
    const s2 = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(s1.token));
    const e2 = await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(s2.token));
    await request(app)
      .delete(`/api/enrollments/${e2.body.data.enrollment.id}`)
      .set(auth(s2.token));

    const res = await request(app)
      .get("/api/enrollments/statistics")
      .set(auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalEnrollments: 2,
      activeEnrollments: 1,
      completedEnrollments: 0,
      cancelledEnrollments: 1,
    });

    const asStudent = await request(app)
      .get("/api/enrollments/statistics")
      .set(auth(s1.token));
    expect(asStudent.status).toBe(403);
  });
});
