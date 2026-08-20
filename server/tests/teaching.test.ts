/**
 * The instructor dashboard aggregate. The interesting assertions are the
 * arithmetic ones: the overview has to agree with what the per-student progress
 * endpoint reports, or the dashboard is quietly lying.
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

const createUser = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Teach",
    lastName: `${role}${counter}`,
    email: `teach-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A published course with `lessonCount` published lessons in one module. */
const buildCourse = async (
  instructorId: string,
  { lessonCount = 2, status = CourseStatus.PUBLISHED } = {}
) => {
  counter += 1;
  const course = await Course.create({
    title: `Teaching Course ${counter}`,
    slug: `teaching-course-${counter}`,
    description: "A course used by the teaching-overview tests.",
    category: "programming",
    level: "beginner",
    instructor: instructorId,
    status,
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

const overview = (token: string) =>
  request(app).get("/api/teaching/overview").set(auth(token));

describe("GET /api/teaching/overview", () => {
  it("is staff-only", async () => {
    const student = await createUser(UserRole.STUDENT);

    expect((await overview(student.token)).status).toBe(403);
    expect((await request(app).get("/api/teaching/overview")).status).toBe(401);
  });

  it("returns an empty overview for an instructor with no courses", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);

    const res = await overview(instructor.token);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      courses: { total: 0, published: 0, draft: 0, archived: 0 },
      students: { total: 0, active: 0, completed: 0, cancelled: 0 },
      engagement: { averageProgress: 0, completions: 0, completionRate: 0 },
      quizzes: { attempts: 0, averageScore: null, passRate: null },
    });
    expect(res.body.data.courseBreakdown).toEqual([]);
    expect(res.body.data.nudges).toEqual([]);
  });

  it("counts courses by status and students by enrollment state", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const published = await buildCourse(instructor.user._id.toString());
    await buildCourse(instructor.user._id.toString(), { status: CourseStatus.DRAFT });
    await buildCourse(instructor.user._id.toString(), { status: CourseStatus.ARCHIVED });

    const active = await createUser(UserRole.STUDENT);
    const completed = await createUser(UserRole.STUDENT);
    const cancelled = await createUser(UserRole.STUDENT);
    await enroll(active.user._id.toString(), published.course._id.toString());
    await enroll(
      completed.user._id.toString(),
      published.course._id.toString(),
      EnrollmentStatus.COMPLETED
    );
    await enroll(
      cancelled.user._id.toString(),
      published.course._id.toString(),
      EnrollmentStatus.CANCELLED
    );

    const res = await overview(instructor.token);

    expect(res.body.data.courses).toEqual({
      total: 3,
      published: 1,
      draft: 1,
      archived: 1,
    });
    expect(res.body.data.students).toEqual({
      total: 2, // cancelled students are not "yours" any more
      active: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it("counts a student in two courses once in the headcount", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const first = await buildCourse(instructor.user._id.toString());
    const second = await buildCourse(instructor.user._id.toString());
    const student = await createUser(UserRole.STUDENT);

    await enroll(student.user._id.toString(), first.course._id.toString());
    await enroll(student.user._id.toString(), second.course._id.toString());

    const res = await overview(instructor.token);

    expect(res.body.data.students.total).toBe(1);
    expect(res.body.data.students.active).toBe(2); // two enrollments, one person
  });

  it("averages progress to the same figure the student's own endpoint reports", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 4,
    });
    const alice = await createUser(UserRole.STUDENT);
    const bob = await createUser(UserRole.STUDENT);
    await enroll(alice.user._id.toString(), course._id.toString());
    await enroll(bob.user._id.toString(), course._id.toString());

    // Alice finishes 2 of 4 (50%), Bob finishes 1 of 4 (25%) → mean 37.5 → 38.
    for (const lesson of lessons.slice(0, 2)) {
      await request(app)
        .post(`/api/lessons/${lesson._id.toString()}/complete`)
        .set(auth(alice.token));
    }
    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(bob.token));

    const aliceProgress = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(alice.token));
    const bobProgress = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(bob.token));
    expect(aliceProgress.body.data.progress.progressPercentage).toBe(50);
    expect(bobProgress.body.data.progress.progressPercentage).toBe(25);

    const res = await overview(instructor.token);
    const row = res.body.data.courseBreakdown[0];

    // (2 + 1) completed units over (4 required × 2 students) = 37.5% → 38.
    expect(row).toMatchObject({
      publishedLessons: 4,
      requiredQuizzes: 0,
      students: 2,
      averageProgress: 38,
    });
    expect(res.body.data.engagement.averageProgress).toBe(38);
  });

  it("excludes a cancelled student's progress from the average", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 2,
    });
    const staying = await createUser(UserRole.STUDENT);
    const leaving = await createUser(UserRole.STUDENT);
    await enroll(staying.user._id.toString(), course._id.toString());
    await enroll(leaving.user._id.toString(), course._id.toString());

    // The leaver finishes everything, then cancels.
    for (const lesson of lessons) {
      await request(app)
        .post(`/api/lessons/${lesson._id.toString()}/complete`)
        .set(auth(leaving.token));
    }
    await Enrollment.updateOne(
      { student: leaving.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED, completedAt: null }
    );

    const res = await overview(instructor.token);
    const row = res.body.data.courseBreakdown[0];

    // Only the remaining student counts, and they have done nothing.
    expect(row.students).toBe(1);
    expect(row.averageProgress).toBe(0);
  });

  it("ignores content that is not published", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, module, lessons } = await buildCourse(
      instructor.user._id.toString(),
      { lessonCount: 2 }
    );
    const student = await createUser(UserRole.STUDENT);
    await enroll(student.user._id.toString(), course._id.toString());

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    // Unpublishing the second lesson shrinks the denominator to 1, so the one
    // completion becomes 100%.
    await Lesson.updateOne({ _id: lessons[1]._id }, { isPublished: false });
    let res = await overview(instructor.token);
    expect(res.body.data.courseBreakdown[0]).toMatchObject({
      publishedLessons: 1,
      averageProgress: 100,
    });

    // Unpublishing the module takes everything out of scope.
    await Module.updateOne({ _id: module._id }, { isPublished: false });
    res = await overview(instructor.token);
    expect(res.body.data.courseBreakdown[0]).toMatchObject({
      publishedLessons: 0,
      averageProgress: 0,
    });
  });

  it("counts required quizzes in the denominator and passes in the numerator", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 1,
    });
    const student = await createUser(UserRole.STUDENT);
    await enroll(student.user._id.toString(), course._id.toString());

    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({
        title: "Required Check",
        passingScore: 70,
        isRequired: true,
        questions: [
          {
            questionText: "Pick the right one.",
            type: "multiple-choice",
            options: ["Alpha", "Beta"],
            correctAnswer: "Alpha",
            points: 10,
          },
        ],
      });
    const quiz = created.body.data.quiz;
    await request(app)
      .patch(`/api/quizzes/${quiz.id}/status`)
      .set(auth(instructor.token))
      .send({ isPublished: true });

    // One lesson + one required quiz = 2 required items.
    let res = await overview(instructor.token);
    expect(res.body.data.courseBreakdown[0]).toMatchObject({
      publishedLessons: 1,
      requiredQuizzes: 1,
      averageProgress: 0,
    });

    // Failing does not move the numerator.
    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });
    res = await overview(instructor.token);
    expect(res.body.data.courseBreakdown[0].averageProgress).toBe(0);
    expect(res.body.data.quizzes).toMatchObject({
      published: 1,
      attempts: 1,
      averageScore: 0,
      passRate: 0,
    });

    // Passing does.
    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }] });
    res = await overview(instructor.token);
    expect(res.body.data.courseBreakdown[0].averageProgress).toBe(50);
    expect(res.body.data.quizzes).toMatchObject({
      attempts: 2,
      averageScore: 50, // one 0% and one 100%
      passRate: 50,
    });
  });

  it("reports completions, completion rate and certificates once a course is finished", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 1,
    });
    const finisher = await createUser(UserRole.STUDENT);
    const other = await createUser(UserRole.STUDENT);
    await enroll(finisher.user._id.toString(), course._id.toString());
    await enroll(other.user._id.toString(), course._id.toString());

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(finisher.token));

    const res = await overview(instructor.token);
    const row = res.body.data.courseBreakdown[0];

    expect(row).toMatchObject({
      students: 2,
      completions: 1,
      completionRate: 50,
      certificatesIssued: 1,
      averageProgress: 50,
    });
    expect(res.body.data.engagement).toMatchObject({
      completions: 1,
      completionRate: 50,
      certificatesIssued: 1,
    });
  });

  it("never reports another instructor's courses", async () => {
    const mine = await createUser(UserRole.INSTRUCTOR);
    const theirs = await createUser(UserRole.INSTRUCTOR);
    const myCourse = await buildCourse(mine.user._id.toString());
    const theirCourse = await buildCourse(theirs.user._id.toString());

    const student = await createUser(UserRole.STUDENT);
    await enroll(student.user._id.toString(), theirCourse.course._id.toString());

    const res = await overview(mine.token);

    expect(res.body.data.courses.total).toBe(1);
    expect(res.body.data.courseBreakdown).toHaveLength(1);
    expect(res.body.data.courseBreakdown[0].courseId).toBe(myCourse.course._id.toString());
    // Their enrolled student is not in my numbers.
    expect(res.body.data.students.total).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain(theirCourse.course.title);
  });

  it("gives an admin the whole platform", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const first = await createUser(UserRole.INSTRUCTOR);
    const second = await createUser(UserRole.INSTRUCTOR);
    await buildCourse(first.user._id.toString());
    await buildCourse(second.user._id.toString());

    const res = await overview(admin.token);

    expect(res.status).toBe(200);
    expect(res.body.data.courses.total).toBe(2);
    expect(res.body.data.courseBreakdown).toHaveLength(2);
  });

  it("lists the least advanced students, skipping recent sign-ups", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lessons } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 2,
    });

    const stuck = await createUser(UserRole.STUDENT);
    const moving = await createUser(UserRole.STUDENT);
    const fresh = await createUser(UserRole.STUDENT);

    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await Enrollment.create({
      student: stuck.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: old,
    });
    await Enrollment.create({
      student: moving.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: old,
    });
    // Enrolled today — too new to be "stuck".
    await enroll(fresh.user._id.toString(), course._id.toString());

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(moving.token));

    const res = await overview(instructor.token);
    const nudges = res.body.data.nudges as {
      studentName: string;
      progressPercentage: number;
      courseTitle: string;
    }[];

    const names = nudges.map((n) => n.studentName);
    expect(names).toContain(`${stuck.user.firstName} ${stuck.user.lastName}`);
    expect(names).toContain(`${moving.user.firstName} ${moving.user.lastName}`);
    expect(names).not.toContain(`${fresh.user.firstName} ${fresh.user.lastName}`);

    // Least advanced first.
    expect(nudges[0].progressPercentage).toBe(0);
    expect(nudges[0].studentName).toBe(`${stuck.user.firstName} ${stuck.user.lastName}`);
    expect(nudges[1].progressPercentage).toBe(50);
    expect(nudges[0].courseTitle).toBe(course.title);
  });

  it("leaves completed and cancelled students off the nudge list", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 1,
    });
    const done = await createUser(UserRole.STUDENT);
    const gone = await createUser(UserRole.STUDENT);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await Enrollment.create({
      student: done.user._id,
      course: course._id,
      status: EnrollmentStatus.COMPLETED,
      enrolledAt: old,
    });
    await Enrollment.create({
      student: gone.user._id,
      course: course._id,
      status: EnrollmentStatus.CANCELLED,
      enrolledAt: old,
    });

    const res = await overview(instructor.token);

    expect(res.body.data.nudges).toEqual([]);
  });

  it("does not strand anyone in a course with nothing to complete", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 0,
    });
    const student = await createUser(UserRole.STUDENT);
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const res = await overview(instructor.token);

    // No required items means no progress to be behind on.
    expect(res.body.data.courseBreakdown[0]).toMatchObject({
      publishedLessons: 0,
      averageProgress: 0,
    });
    expect(res.body.data.nudges).toEqual([]);
  });

  it("never leaks a password or an email into the payload", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course } = await buildCourse(instructor.user._id.toString(), {
      lessonCount: 1,
    });
    const student = await createUser(UserRole.STUDENT);
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const res = await overview(instructor.token);
    const raw = JSON.stringify(res.body);

    expect(raw).not.toContain("password");
    expect(raw).not.toContain("$2b$");
    expect(raw).not.toContain(student.user.email);
  });
});
