/**
 * The instructor student roster. One row per enrolment, scoped to the caller's
 * own courses, with progress that has to agree with the student's own view.
 */
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

const createUser = async (role: UserRole, first = "Ros") => {
  counter += 1;
  const user = await User.create({
    firstName: first,
    lastName: `${role}${counter}`,
    email: `ros-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const buildCourse = async (instructorId: string, lessonCount = 2) => {
  counter += 1;
  const course = await Course.create({
    title: `Roster Course ${counter}`,
    slug: `roster-course-${counter}`,
    description: "A course used by the roster tests.",
    category: "programming",
    level: "beginner",
    instructor: instructorId,
    status: CourseStatus.PUBLISHED,
  });
  const module = await Module.create({
    course: course._id,
    title: "Module One",
    order: 1,
    isPublished: true,
  });
  const lessons = [];
  for (let index = 1; index <= lessonCount; index += 1) {
    lessons.push(
      await Lesson.create({
        course: course._id,
        module: module._id,
        title: `Lesson ${index}`,
        type: LessonType.TEXT,
        content: "Body.",
        order: index,
        isPublished: true,
      })
    );
  }
  return { course, module, lessons };
};

const enroll = (studentId: string, courseId: string, status = EnrollmentStatus.ACTIVE) =>
  Enrollment.create({ student: studentId, course: courseId, status });

const roster = (token: string, qs = "") =>
  request(app).get(`/api/teaching/students${qs}`).set(auth(token));

describe("GET /api/teaching/students", () => {
  it("is staff-only", async () => {
    const student = await createUser(UserRole.STUDENT);

    expect((await roster(student.token)).status).toBe(403);
    expect((await request(app).get("/api/teaching/students")).status).toBe(401);
  });

  it("lists one row per enrolment with progress matching the student's own view", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), 4);
    const learner = await createUser(UserRole.STUDENT, "Ada");
    await enroll(learner.user._id.toString(), course._id.toString());

    for (const lesson of lessons.slice(0, 3)) {
      await request(app)
        .post(`/api/lessons/${lesson._id.toString()}/complete`)
        .set(auth(learner.token));
    }

    const own = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(learner.token));
    expect(own.body.data.progress.progressPercentage).toBe(75);

    const res = await roster(instructor.token);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      studentId: learner.user._id.toString(),
      firstName: "Ada",
      email: learner.user.email,
      courseId: course._id.toString(),
      courseTitle: course.title,
      status: "active",
      progressPercentage: 75,
      completedLessons: 3,
      totalLessons: 4,
      certificateIssued: false,
    });
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });

  it("gives the same person two rows when they are in two of your courses", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const first = await buildCourse(instructor.user._id.toString());
    const second = await buildCourse(instructor.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);

    await enroll(learner.user._id.toString(), first.course._id.toString());
    await enroll(learner.user._id.toString(), second.course._id.toString());

    const res = await roster(instructor.token);

    expect(res.body.pagination.total).toBe(2);
    const courseIds = (res.body.data as { courseId: string }[]).map((r) => r.courseId);
    expect(new Set(courseIds).size).toBe(2);
  });

  it("never shows another instructor's students", async () => {
    const mine = await createUser(UserRole.INSTRUCTOR);
    const theirs = await createUser(UserRole.INSTRUCTOR);
    const myCourse = await buildCourse(mine.user._id.toString());
    const theirCourse = await buildCourse(theirs.user._id.toString());

    const myStudent = await createUser(UserRole.STUDENT, "Mine");
    const theirStudent = await createUser(UserRole.STUDENT, "Theirs");
    await enroll(myStudent.user._id.toString(), myCourse.course._id.toString());
    await enroll(theirStudent.user._id.toString(), theirCourse.course._id.toString());

    const res = await roster(mine.token);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].firstName).toBe("Mine");
    expect(JSON.stringify(res.body)).not.toContain(theirStudent.user.email);
    expect(JSON.stringify(res.body)).not.toContain(theirCourse.course.title);
  });

  it("refuses to scope to a course the caller does not own", async () => {
    const mine = await createUser(UserRole.INSTRUCTOR);
    const theirs = await createUser(UserRole.INSTRUCTOR);
    await buildCourse(mine.user._id.toString());
    const theirCourse = await buildCourse(theirs.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);
    await enroll(learner.user._id.toString(), theirCourse.course._id.toString());

    // Asking for someone else's course id returns nothing, not their roster.
    const res = await roster(mine.token, `?course=${theirCourse.course._id.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it("filters to one of your own courses", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const first = await buildCourse(instructor.user._id.toString());
    const second = await buildCourse(instructor.user._id.toString());
    const a = await createUser(UserRole.STUDENT, "Alpha");
    const b = await createUser(UserRole.STUDENT, "Beta");
    await enroll(a.user._id.toString(), first.course._id.toString());
    await enroll(b.user._id.toString(), second.course._id.toString());

    const res = await roster(instructor.token, `?course=${first.course._id.toString()}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].firstName).toBe("Alpha");
  });

  it("filters by enrolment status", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    const active = await createUser(UserRole.STUDENT, "Active");
    const gone = await createUser(UserRole.STUDENT, "Gone");
    await enroll(active.user._id.toString(), course._id.toString());
    await enroll(
      gone.user._id.toString(),
      course._id.toString(),
      EnrollmentStatus.CANCELLED
    );

    // Unlike the dashboard averages, the roster shows cancelled students too —
    // an instructor needs to see who left.
    expect((await roster(instructor.token)).body.pagination.total).toBe(2);

    const cancelled = await roster(instructor.token, "?status=cancelled");
    expect(cancelled.body.data).toHaveLength(1);
    expect(cancelled.body.data[0].firstName).toBe("Gone");
  });

  it("searches by name and by email", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    const target = await createUser(UserRole.STUDENT, "Zebedee");
    const other = await createUser(UserRole.STUDENT, "Quentin");
    await enroll(target.user._id.toString(), course._id.toString());
    await enroll(other.user._id.toString(), course._id.toString());

    const byName = await roster(instructor.token, "?search=zebe");
    expect(byName.body.data).toHaveLength(1);
    expect(byName.body.data[0].firstName).toBe("Zebedee");

    const byEmail = await roster(
      instructor.token,
      `?search=${encodeURIComponent(other.user.email)}`
    );
    expect(byEmail.body.data).toHaveLength(1);
    expect(byEmail.body.data[0].firstName).toBe("Quentin");

    const nobody = await roster(instructor.token, "?search=nobodyatall");
    expect(nobody.body.data).toEqual([]);
    expect(nobody.body.pagination.total).toBe(0);
  });

  it("treats a regex in the search box as literal text", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);
    await enroll(learner.user._id.toString(), course._id.toString());

    const res = await roster(instructor.token, `?search=${encodeURIComponent("(a+)+$")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("sorts by progress and by name", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), 2);
    const ahead = await createUser(UserRole.STUDENT, "Aaron");
    const behind = await createUser(UserRole.STUDENT, "Zoe");
    await enroll(ahead.user._id.toString(), course._id.toString());
    await enroll(behind.user._id.toString(), course._id.toString());

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(ahead.token));

    const byProgress = await roster(instructor.token, "?sortBy=progress&sortOrder=asc");
    expect(byProgress.body.data[0].firstName).toBe("Zoe"); // 0%
    expect(byProgress.body.data[1].firstName).toBe("Aaron"); // 50%

    const byName = await roster(instructor.token, "?sortBy=name&sortOrder=asc");
    expect(byName.body.data[0].firstName).toBe("Aaron");
  });

  it("paginates, and rejects unsafe page sizes", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    for (let index = 0; index < 3; index += 1) {
      const learner = await createUser(UserRole.STUDENT);
      await enroll(learner.user._id.toString(), course._id.toString());
    }

    const page = await roster(instructor.token, "?limit=2&page=1");
    expect(page.body.data).toHaveLength(2);
    expect(page.body.pagination).toMatchObject({ total: 3, totalPages: 2 });

    const second = await roster(instructor.token, "?limit=2&page=2");
    expect(second.body.data).toHaveLength(1);

    for (const qs of ["?limit=0", "?limit=1000", "?page=0", "?sortBy=password"]) {
      expect((await roster(instructor.token, qs)).status, qs).toBe(400);
    }
  });

  it("flags a student who has earned a certificate", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), 1);
    const finisher = await createUser(UserRole.STUDENT);
    await enroll(finisher.user._id.toString(), course._id.toString());

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(finisher.token));

    const res = await roster(instructor.token);

    expect(res.body.data[0]).toMatchObject({
      progressPercentage: 100,
      status: "completed",
      certificateIssued: true,
    });
    expect(res.body.data[0].completedAt).toBeTruthy();
  });

  it("survives a course whose content is all unpublished", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, module } = await buildCourse(instructor.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);
    await enroll(learner.user._id.toString(), course._id.toString());
    await Module.updateOne({ _id: module._id }, { isPublished: false });

    const res = await roster(instructor.token);

    // Nothing to complete means 0%, not a division by zero.
    expect(res.body.data[0]).toMatchObject({
      totalLessons: 0,
      totalRequiredQuizzes: 0,
      progressPercentage: 0,
    });
  });

  it("names a deleted account rather than breaking the row", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);
    await enroll(learner.user._id.toString(), course._id.toString());
    await User.deleteOne({ _id: learner.user._id });

    const res = await roster(instructor.token);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ firstName: "Deleted", lastName: "user" });
  });

  it("gives an admin every course on the platform", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const first = await createUser(UserRole.INSTRUCTOR);
    const second = await createUser(UserRole.INSTRUCTOR);
    const a = await buildCourse(first.user._id.toString());
    const b = await buildCourse(second.user._id.toString());
    for (const course of [a.course, b.course]) {
      const learner = await createUser(UserRole.STUDENT);
      await enroll(learner.user._id.toString(), course._id.toString());
    }

    const res = await roster(admin.token);

    expect(res.body.pagination.total).toBe(2);
  });

  it("never leaks a password hash", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString());
    const learner = await createUser(UserRole.STUDENT);
    await enroll(learner.user._id.toString(), course._id.toString());

    const res = await roster(instructor.token);

    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });
});
