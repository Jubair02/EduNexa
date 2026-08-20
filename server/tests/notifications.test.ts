/**
 * Notifications are derived from records that already exist, so the tests are
 * about two things: does each role see the right events, and does the unread
 * mark behave.
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

const createUser = async (role: UserRole, first = "Note") => {
  counter += 1;
  const user = await User.create({
    firstName: first,
    lastName: `${role}${counter}`,
    email: `note-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const buildCourse = async (instructorId: string, lessonCount = 1) => {
  counter += 1;
  const course = await Course.create({
    title: `Notify Course ${counter}`,
    slug: `notify-course-${counter}`,
    description: "A course used by the notification tests.",
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

const feed = (token: string) => request(app).get("/api/notifications").set(auth(token));

describe("GET /api/notifications", () => {
  it("requires a session", async () => {
    expect((await request(app).get("/api/notifications")).status).toBe(401);
  });

  it("is empty for an account with no history", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await feed(student.token);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("tells a student about their certificate and their quiz results", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course, lessons } = await buildCourse(instructor.user._id.toString());
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });

    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({
        title: "Notify Quiz",
        passingScore: 70,
        isRequired: false,
        questions: [
          {
            questionText: "Pick one.",
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

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }] });

    // Finishing the only lesson completes the course and issues a certificate.
    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const res = await feed(student.token);
    const kinds = (res.body.data.notifications as { kind: string }[]).map((n) => n.kind);

    expect(kinds).toContain("certificate-earned");
    expect(kinds).toContain("quiz-result");
    expect(kinds).toContain("course-completed");

    const quizResult = res.body.data.notifications.find(
      (n: { kind: string }) => n.kind === "quiz-result"
    );
    expect(quizResult.title).toBe("Quiz passed");
    expect(quizResult.body).toContain("100%");
    expect(quizResult.body).toContain("Notify Quiz");
  });

  it("says a failed attempt has not passed yet, without pretending otherwise", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });

    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({
        title: "Hard Quiz",
        passingScore: 70,
        isRequired: false,
        questions: [
          {
            questionText: "Pick one.",
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
    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });

    const res = await feed(student.token);
    const result = res.body.data.notifications.find(
      (n: { kind: string }) => n.kind === "quiz-result"
    );
    expect(result.title).toBe("Quiz not passed yet");
    expect(result.body).toContain("0%");
  });

  it("never shows one student another student's activity", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const mine = await createUser(UserRole.STUDENT, "Mine");
    const other = await createUser(UserRole.STUDENT, "Other");
    const { course, lessons } = await buildCourse(instructor.user._id.toString());

    for (const student of [mine, other]) {
      await Enrollment.create({
        student: student.user._id,
        course: course._id,
        status: EnrollmentStatus.ACTIVE,
      });
    }
    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(other.token));

    const res = await feed(mine.token);

    expect(res.body.data.notifications).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(other.user.email);
  });

  it("tells an instructor about enrolments and completions on their courses", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT, "Joiner");
    const { course, lessons } = await buildCourse(instructor.user._id.toString());

    await request(app)
      .post(`/api/courses/${course._id.toString()}/enroll`)
      .set(auth(student.token));
    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const res = await feed(instructor.token);
    const kinds = (res.body.data.notifications as { kind: string }[]).map((n) => n.kind);

    expect(kinds).toContain("new-enrollment");
    expect(kinds).toContain("student-completed");
    expect(kinds).toContain("certificate-issued");

    const joined = res.body.data.notifications.find(
      (n: { kind: string }) => n.kind === "new-enrollment"
    );
    expect(joined.body).toContain("Joiner");
    expect(joined.body).toContain(course.title);
  });

  it("never shows one instructor another instructor's activity", async () => {
    const mine = await createUser(UserRole.INSTRUCTOR);
    const theirs = await createUser(UserRole.INSTRUCTOR);
    await buildCourse(mine.user._id.toString());
    const theirCourse = await buildCourse(theirs.user._id.toString());
    const student = await createUser(UserRole.STUDENT);

    await request(app)
      .post(`/api/courses/${theirCourse.course._id.toString()}/enroll`)
      .set(auth(student.token));

    const res = await feed(mine.token);

    expect(res.body.data.notifications).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(theirCourse.course.title);
  });

  it("tells an admin about new accounts platform-wide", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const newcomer = await createUser(UserRole.STUDENT, "Fresh");

    const res = await feed(admin.token);
    const users = (res.body.data.notifications as { kind: string; body: string }[]).filter(
      (n) => n.kind === "new-user"
    );

    expect(users.length).toBeGreaterThan(0);
    expect(users.some((n) => n.body.includes("Fresh"))).toBe(true);
    expect(users.some((n) => n.body.includes("joined as a student"))).toBe(true);
    expect(newcomer.user.role).toBe(UserRole.STUDENT);
  });

  it("never leaks an email or a password hash", async () => {
    const admin = await createUser(UserRole.ADMIN);
    await createUser(UserRole.STUDENT);

    const res = await feed(admin.token);
    const raw = JSON.stringify(res.body);

    expect(raw).not.toContain("@example.com");
    expect(raw).not.toContain("password");
    expect(raw).not.toContain("$2b$");
  });

  it("sorts newest first and caps the feed", async () => {
    const admin = await createUser(UserRole.ADMIN);
    for (let index = 0; index < 25; index += 1) {
      await createUser(UserRole.STUDENT);
    }

    const res = await feed(admin.token);
    const items = res.body.data.notifications as { at: string }[];

    expect(items.length).toBeLessThanOrEqual(20);
    const times = items.map((item) => new Date(item.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("gives every notification a stable id", async () => {
    const admin = await createUser(UserRole.ADMIN);
    await createUser(UserRole.STUDENT);

    const first = await feed(admin.token);
    const second = await feed(admin.token);

    const ids = (first.body.data.notifications as { id: string }[]).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((second.body.data.notifications as { id: string }[]).map((n) => n.id)).toEqual(
      ids
    );
  });
});

describe("POST /api/notifications/seen", () => {
  it("marks nothing unread on a first visit, then flags what arrives after", async () => {
    const admin = await createUser(UserRole.ADMIN);

    // Nothing has ever been seen, so the whole history is not "new".
    const before = await feed(admin.token);
    expect(before.body.data.unreadCount).toBe(0);

    const seen = await request(app)
      .post("/api/notifications/seen")
      .set(auth(admin.token));
    expect(seen.status).toBe(200);
    expect((await User.findById(admin.user._id))?.notificationsSeenAt).toBeTruthy();

    // Still nothing new immediately afterwards.
    expect((await feed(admin.token)).body.data.unreadCount).toBe(0);

    // Something happens; now it is unread.
    await createUser(UserRole.STUDENT, "Later");
    const after = await feed(admin.token);
    expect(after.body.data.unreadCount).toBeGreaterThan(0);
    const unread = (after.body.data.notifications as { isUnread: boolean; body: string }[])
      .filter((n) => n.isUnread);
    expect(unread.some((n) => n.body.includes("Later"))).toBe(true);
  });

  it("clears the unread mark when opened again", async () => {
    const admin = await createUser(UserRole.ADMIN);
    await request(app).post("/api/notifications/seen").set(auth(admin.token));
    await createUser(UserRole.STUDENT);

    expect((await feed(admin.token)).body.data.unreadCount).toBeGreaterThan(0);

    await request(app).post("/api/notifications/seen").set(auth(admin.token));
    expect((await feed(admin.token)).body.data.unreadCount).toBe(0);
  });

  it("requires a session", async () => {
    expect((await request(app).post("/api/notifications/seen")).status).toBe(401);
  });

  it("keeps one person's read state out of another's", async () => {
    const first = await createUser(UserRole.ADMIN);
    const second = await createUser(UserRole.ADMIN);

    await request(app).post("/api/notifications/seen").set(auth(first.token));
    await createUser(UserRole.STUDENT);

    expect((await feed(first.token)).body.data.unreadCount).toBeGreaterThan(0);
    // The second admin has never opened theirs, so nothing is flagged for them.
    expect((await feed(second.token)).body.data.unreadCount).toBe(0);
    expect((await User.findById(second.user._id))?.notificationsSeenAt).toBeUndefined();
  });
});
