/**
 * Phase 8 security suite. Everything here is an attack, not a feature test:
 * each case tries to reach data or an action the caller must not have, and
 * asserts the API refuses. Grouped by the class of flaw being probed.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Certificate, CertificateStatus } from "../src/models/certificate.model";
import { Course, CourseStatus } from "../src/models/course.model";
import { Enrollment, EnrollmentStatus } from "../src/models/enrollment.model";
import { Lesson, LessonType } from "../src/models/lesson.model";
import { Module } from "../src/models/module.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUser = async (role: UserRole, isActive = true) => {
  counter += 1;
  const user = await User.create({
    firstName: "Sec",
    lastName: `${role}${counter}`,
    email: `sec-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
    isActive,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A published course with one published module and lesson. */
const buildCourse = async (instructorId: string) => {
  counter += 1;
  const course = await Course.create({
    title: `Secure Course ${counter}`,
    slug: `secure-course-${counter}`,
    description: "A course used by the security suite.",
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
  const lesson = await Lesson.create({
    course: course._id,
    module: module._id,
    title: "Lesson One",
    type: LessonType.TEXT,
    content: "Lesson body.",
    order: 1,
    isPublished: true,
  });
  return { course, module, lesson };
};

const quizBody = {
  title: "Security Quiz",
  passingScore: 70,
  isRequired: true,
  questions: [
    {
      questionText: "Which option is correct?",
      type: "multiple-choice",
      options: ["Alpha", "Beta"],
      correctAnswer: "Alpha",
      points: 10,
    },
  ],
};

const createPublishedQuiz = async (courseId: string, token: string) => {
  const created = await request(app)
    .post(`/api/courses/${courseId}/quizzes`)
    .set(auth(token))
    .send(quizBody);
  const quiz = created.body.data.quiz as { id: string; questions: { id: string }[] };
  await request(app)
    .patch(`/api/quizzes/${quiz.id}/status`)
    .set(auth(token))
    .send({ isPublished: true });
  return quiz;
};

describe("authentication hardening", () => {
  it("rejects missing, malformed, tampered and foreign-signed tokens", async () => {
    const { token } = await createUser(UserRole.STUDENT);
    const url = "/api/auth/me";

    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set({ Authorization: token })).status).toBe(401);
    expect((await request(app).get(url).set(auth("garbage"))).status).toBe(401);

    // Flip the last character of the signature; the payload is unchanged.
    const [header, payload, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    expect(
      (await request(app).get(url).set(auth(`${header}.${payload}.${flipped}`))).status
    ).toBe(401);

    const foreign = [header, payload, "Zm9yZ2VkLXNpZ25hdHVyZQ"].join(".");
    expect((await request(app).get(url).set(auth(foreign))).status).toBe(401);
  });

  it("rejects an unsigned none-algorithm token", async () => {
    const { user } = await createUser(UserRole.ADMIN);
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url"
    );
    const payload = Buffer.from(
      JSON.stringify({ userId: user._id.toString(), role: "admin" })
    ).toString("base64url");

    const res = await request(app).get("/api/auth/me").set(auth(`${header}.${payload}.`));

    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const { user } = await createUser(UserRole.STUDENT);
    const jwt = (await import("jsonwebtoken")).default;
    const { env } = await import("../src/config/env");
    const expired = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    const res = await request(app).get("/api/auth/me").set(auth(expired));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("refuses a valid token whose account was deleted or deactivated", async () => {
    const deleted = await createUser(UserRole.STUDENT);
    await User.deleteOne({ _id: deleted.user._id });
    expect((await request(app).get("/api/auth/me").set(auth(deleted.token))).status).toBe(
      401
    );

    const disabled = await createUser(UserRole.STUDENT);
    await User.updateOne({ _id: disabled.user._id }, { isActive: false });
    const res = await request(app).get("/api/auth/me").set(auth(disabled.token));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it("denies login to a deactivated account and never returns the hash", async () => {
    counter += 1;
    const email = `sec-inactive-${counter}@example.com`;
    await User.create({
      firstName: "In",
      lastName: "Active",
      email,
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
      isActive: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "sufficiently-long-password" });

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    counter += 1;
    const email = `sec-real-${counter}@example.com`;
    await User.create({
      firstName: "Real",
      lastName: "User",
      email,
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "definitely-not-the-password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "sec-nobody@example.com", password: "definitely-not-the-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it("never lets a client self-assign a privileged role at registration", async () => {
    counter += 1;
    const res = await request(app).post("/api/auth/register").send({
      firstName: "Wants",
      lastName: "Power",
      email: `sec-escalate-${counter}@example.com`,
      password: "sufficiently-long-password",
      role: "admin",
      isActive: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("student");
  });

  it("never exposes a password hash on any user-shaped response", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);

    const responses = await Promise.all([
      request(app).get("/api/auth/me").set(auth(admin.token)),
      request(app).get("/api/users").set(auth(admin.token)),
      request(app).get(`/api/users/${student.user._id.toString()}`).set(auth(admin.token)),
      request(app).get("/api/users/recent").set(auth(admin.token)),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain("password");
      expect(raw).not.toContain("$2b$");
    }
  });
});

describe("role-based access control", () => {
  it("keeps admin-only endpoints away from students, instructors and guests", async () => {
    const student = await createUser(UserRole.STUDENT);
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const target = await createUser(UserRole.STUDENT);
    const id = target.user._id.toString();

    const cases: [string, "get" | "post" | "put" | "patch" | "delete", object?][] = [
      ["/api/users", "get"],
      ["/api/users/statistics", "get"],
      ["/api/users/recent", "get"],
      [`/api/users/${id}`, "get"],
      [`/api/users/${id}`, "put", { firstName: "Hijacked" }],
      [`/api/users/${id}/status`, "patch", { isActive: false }],
      [`/api/users/${id}`, "delete"],
      ["/api/quiz-attempts", "get"],
    ];

    for (const [url, method, body] of cases) {
      for (const actor of [student, instructor]) {
        const res = await request(app)[method](url).set(auth(actor.token)).send(body ?? {});
        expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
      }
      const anon = await request(app)[method](url).send(body ?? {});
      expect(anon.status, `anonymous ${method.toUpperCase()} ${url}`).toBe(401);
    }
  });

  it("keeps student-only endpoints away from staff", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { course, lesson } = await buildCourse(instructor.user._id.toString());
    const courseId = course._id.toString();
    const lessonId = lesson._id.toString();

    const cases: [string, "get" | "post"][] = [
      ["/api/progress/my-courses", "get"],
      ["/api/quizzes/my-quizzes", "get"],
      [`/api/courses/${courseId}/progress`, "get"],
      [`/api/lessons/${lessonId}/progress`, "get"],
      [`/api/lessons/${lessonId}/complete`, "post"],
    ];

    for (const [url, method] of cases) {
      for (const actor of [admin, instructor]) {
        const res = await request(app)[method](url).set(auth(actor.token)).send({});
        expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
      }
      expect((await request(app)[method](url).send({})).status).toBe(401);
    }
  });

  it("stops a student from writing any course content", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course, module, lesson } = await buildCourse(instructor.user._id.toString());
    const courseId = course._id.toString();

    const attempts = await Promise.all([
      request(app)
        .post("/api/courses")
        .set(auth(student.token))
        .send({
          title: "Student Course",
          description: "Long enough description.",
          category: "programming",
          level: "beginner",
        }),
      request(app)
        .put(`/api/courses/${courseId}`)
        .set(auth(student.token))
        .send({ title: "Hijacked" }),
      request(app).delete(`/api/courses/${courseId}`).set(auth(student.token)),
      request(app)
        .post(`/api/courses/${courseId}/modules`)
        .set(auth(student.token))
        .send({ title: "Student Module" }),
      request(app)
        .put(`/api/modules/${module._id.toString()}`)
        .set(auth(student.token))
        .send({ title: "Hijacked" }),
      request(app)
        .put(`/api/lessons/${lesson._id.toString()}`)
        .set(auth(student.token))
        .send({ title: "Hijacked" }),
      request(app)
        .patch(`/api/lessons/${lesson._id.toString()}/status`)
        .set(auth(student.token))
        .send({ isPublished: false }),
      request(app).post("/api/uploads?kind=image").set(auth(student.token)),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(403);
    }
    expect(await Course.countDocuments({ title: "Student Course" })).toBe(0);
    expect((await Course.findById(courseId))?.title).toBe(course.title);
  });
});

describe("cross-tenant access (IDOR)", () => {
  it("stops one instructor from touching another's course tree", async () => {
    const owner = await createUser(UserRole.INSTRUCTOR);
    const other = await createUser(UserRole.INSTRUCTOR);
    const { course, module, lesson } = await buildCourse(owner.user._id.toString());
    const courseId = course._id.toString();

    const writes = await Promise.all([
      request(app)
        .put(`/api/courses/${courseId}`)
        .set(auth(other.token))
        .send({ title: "Stolen" }),
      request(app)
        .patch(`/api/courses/${courseId}/status`)
        .set(auth(other.token))
        .send({ status: "archived" }),
      request(app).delete(`/api/courses/${courseId}`).set(auth(other.token)),
      request(app)
        .post(`/api/courses/${courseId}/modules`)
        .set(auth(other.token))
        .send({ title: "Intruder Module" }),
      request(app)
        .put(`/api/modules/${module._id.toString()}`)
        .set(auth(other.token))
        .send({ title: "Stolen" }),
      request(app).delete(`/api/lessons/${lesson._id.toString()}`).set(auth(other.token)),
      request(app)
        .post(`/api/courses/${courseId}/quizzes`)
        .set(auth(other.token))
        .send(quizBody),
      request(app)
        .get(`/api/courses/${courseId}/completion-statistics`)
        .set(auth(other.token)),
      request(app).get(`/api/courses/${courseId}/enrollments`).set(auth(other.token)),
    ]);

    for (const res of writes) {
      expect([403, 404]).toContain(res.status);
    }
    const untouched = await Course.findById(courseId);
    expect(untouched?.title).toBe(course.title);
    expect(untouched?.status).toBe(CourseStatus.PUBLISHED);
  });

  it("stops a student reading another student's enrollment or cancelling it", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const victim = await createUser(UserRole.STUDENT);
    const attacker = await createUser(UserRole.STUDENT);
    const { course, lesson } = await buildCourse(instructor.user._id.toString());
    const courseId = course._id.toString();

    const enrollment = await Enrollment.create({
      student: victim.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    await request(app)
      .post(`/api/lessons/${lesson._id.toString()}/complete`)
      .set(auth(victim.token));

    const stolenRead = await request(app)
      .get(`/api/enrollments/${enrollment._id.toString()}`)
      .set(auth(attacker.token));
    expect([403, 404]).toContain(stolenRead.status);

    const stolenCancel = await request(app)
      .delete(`/api/enrollments/${enrollment._id.toString()}`)
      .set(auth(attacker.token));
    expect([403, 404]).toContain(stolenCancel.status);
    // The victim finishing the only lesson legitimately completes their
    // enrollment; what must not happen is the attacker cancelling it.
    expect((await Enrollment.findById(enrollment._id))?.status).not.toBe(
      EnrollmentStatus.CANCELLED
    );

    // Progress is keyed off the caller's JWT, so the attacker sees nothing of
    // the victim's completions.
    const progress = await request(app)
      .get(`/api/courses/${courseId}/progress`)
      .set(auth(attacker.token));
    expect([200, 403]).toContain(progress.status);
    if (progress.status === 200) {
      expect(progress.body.data.progress.completedLessons).toBe(0);
    }

    const victimProgress = await request(app)
      .get(`/api/courses/${courseId}/progress`)
      .set(auth(victim.token));
    expect(victimProgress.body.data.progress.completedLessons).toBe(1);
  });

  it("ignores a student id supplied in the body when recording progress", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const victim = await createUser(UserRole.STUDENT);
    const attacker = await createUser(UserRole.STUDENT);
    const { course, lesson } = await buildCourse(instructor.user._id.toString());

    for (const student of [victim, attacker]) {
      await Enrollment.create({
        student: student.user._id,
        course: course._id,
        status: EnrollmentStatus.ACTIVE,
      });
    }

    const res = await request(app)
      .patch(`/api/lessons/${lesson._id.toString()}/progress`)
      .set(auth(attacker.token))
      .send({
        isCompleted: true,
        student: victim.user._id.toString(),
        studentId: victim.user._id.toString(),
      });

    expect(res.status).toBe(200);
    const victimProgress = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(victim.token));
    expect(victimProgress.body.data.progress.completedLessons).toBe(0);
  });

  it("stops a student reading another student's certificate by id", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const victim = await createUser(UserRole.STUDENT);
    const attacker = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());

    const enrollment = await Enrollment.create({
      student: victim.user._id,
      course: course._id,
      status: EnrollmentStatus.COMPLETED,
      completedAt: new Date(),
    });
    const certificate = await Certificate.create({
      certificateNumber: "LMS-2026-900001",
      verificationCode: "SECURITYTESTCODE",
      student: victim.user._id,
      course: course._id,
      enrollment: enrollment._id,
      completionDate: new Date(),
      studentName: "Victim Student",
      courseTitle: course.title,
      instructorName: "Ina Structor",
    });
    const id = certificate._id.toString();

    for (const url of [`/api/certificates/${id}`, `/api/certificates/${id}/download`]) {
      const res = await request(app).get(url).set(auth(attacker.token));
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("Victim Student");
    }

    expect(
      (await request(app).get(`/api/certificates/${id}`).set(auth(instructor.token))).status
    ).toBe(404);

    const list = await request(app)
      .get(`/api/certificates?student=${victim.user._id.toString()}`)
      .set(auth(attacker.token));
    expect(list.body.data).toHaveLength(0);

    const revoke = await request(app)
      .patch(`/api/certificates/${id}/status`)
      .set(auth(attacker.token))
      .send({ status: "revoked" });
    expect(revoke.status).toBe(403);
  });

  it("keeps non-enrolled students out of course content and quizzes", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const outsider = await createUser(UserRole.STUDENT);
    const { course, lesson } = await buildCourse(instructor.user._id.toString());
    const courseId = course._id.toString();
    const quiz = await createPublishedQuiz(courseId, instructor.token);

    const lessonBody = await request(app)
      .get(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(outsider.token));
    expect(lessonBody.status).toBe(403);
    expect(JSON.stringify(lessonBody.body)).not.toContain("Lesson body.");

    expect(
      (await request(app).get(`/api/courses/${courseId}/quizzes`).set(auth(outsider.token)))
        .status
    ).toBe(403);
    expect(
      (await request(app).get(`/api/quizzes/${quiz.id}`).set(auth(outsider.token))).status
    ).toBe(403);

    const submit = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(outsider.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }] });
    expect(submit.status).toBe(403);

    const complete = await request(app)
      .post(`/api/lessons/${lesson._id.toString()}/complete`)
      .set(auth(outsider.token));
    expect(complete.status).toBe(403);
  });
});

describe("quiz answer-key confidentiality", () => {
  it("keeps correct answers out of every student-facing surface", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());
    const courseId = course._id.toString();
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const quiz = await createPublishedQuiz(courseId, instructor.token);

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });

    const surfaces = await Promise.all([
      request(app).get(`/api/courses/${courseId}/quizzes`).set(auth(student.token)),
      request(app).get(`/api/quizzes/${quiz.id}`).set(auth(student.token)),
      request(app).get(`/api/quizzes/${quiz.id}/my-results`).set(auth(student.token)),
      request(app).get("/api/quizzes/my-quizzes").set(auth(student.token)),
    ]);

    for (const res of surfaces) {
      expect(res.status).toBe(200);
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain("correctAnswer");
      // "Alpha" is the answer key; it must not appear even as an option leak
      // on a results surface. (The option list itself is public, so only the
      // results endpoints are checked for it.)
      if (!raw.includes("options")) {
        expect(raw).not.toContain("Alpha");
      }
    }
  });

  it("scores server-side and ignores a client-supplied verdict", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        score: 999,
        totalPoints: 999,
        percentage: 100,
        passed: true,
        student: instructor.user._id.toString(),
        answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }],
      });

    expect(res.body.data.result).toMatchObject({ score: 0, percentage: 0, passed: false });
  });
});

describe("progress and completion cannot be forged", () => {
  it("ignores client-supplied progress and certificate fields", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course, module } = await buildCourse(instructor.user._id.toString());
    // A second lesson, so one completion can never reach 100%.
    await Lesson.create({
      course: course._id,
      module: module._id,
      title: "Lesson Two",
      type: LessonType.TEXT,
      content: "More body.",
      order: 2,
      isPublished: true,
    });
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const firstLesson = await Lesson.findOne({ course: course._id, order: 1 });

    const res = await request(app)
      .patch(`/api/lessons/${firstLesson?._id.toString()}/progress`)
      .set(auth(student.token))
      .send({
        isCompleted: true,
        progressPercentage: 100,
        completedLessons: 99,
        certificateAvailable: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.courseProgress).toMatchObject({
      totalLessons: 2,
      completedLessons: 1,
      progressPercentage: 50,
      isCompleted: false,
      certificateAvailable: false,
    });
    expect(await Certificate.countDocuments({ student: student.user._id })).toBe(0);
  });

  it("refuses progress on unpublished content and cancelled enrollments", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course, module, lesson } = await buildCourse(instructor.user._id.toString());
    const url = `/api/lessons/${lesson._id.toString()}/complete`;
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });

    await Lesson.updateOne({ _id: lesson._id }, { isPublished: false });
    expect((await request(app).post(url).set(auth(student.token))).status).toBe(404);

    await Lesson.updateOne({ _id: lesson._id }, { isPublished: true });
    await Module.updateOne({ _id: module._id }, { isPublished: false });
    expect((await request(app).post(url).set(auth(student.token))).status).toBe(404);

    await Module.updateOne({ _id: module._id }, { isPublished: true });
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED }
    );
    expect((await request(app).post(url).set(auth(student.token))).status).toBe(403);
  });
});

describe("public certificate verification", () => {
  it("returns only certificate-face data and no internal ids", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());
    const enrollment = await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.COMPLETED,
      completedAt: new Date(),
    });
    await Certificate.create({
      certificateNumber: "LMS-2026-900002",
      verificationCode: "PUBLICVERIFYCODE",
      student: student.user._id,
      course: course._id,
      enrollment: enrollment._id,
      completionDate: new Date(),
      studentName: "Pat Public",
      courseTitle: course.title,
      instructorName: "Ina Structor",
    });

    const res = await request(app).get("/api/certificates/verify/PUBLICVERIFYCODE");

    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(res.body.data).toMatchObject({ valid: true, studentName: "Pat Public" });
    // Only what is printed on the certificate — no internal identifiers.
    expect(raw).not.toContain(student.user._id.toString());
    expect(raw).not.toContain(enrollment._id.toString());
    expect(raw).not.toContain(course._id.toString());
    expect(raw).not.toContain(student.user.email);
    expect(raw).not.toContain("password");
  });

  it("reports unknown and revoked codes as invalid without leaking why", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString());
    const enrollment = await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.COMPLETED,
      completedAt: new Date(),
    });
    await Certificate.create({
      certificateNumber: "LMS-2026-900003",
      verificationCode: "REVOKEDTESTCODE1",
      student: student.user._id,
      course: course._id,
      enrollment: enrollment._id,
      completionDate: new Date(),
      studentName: "Rev Oked",
      courseTitle: course.title,
      instructorName: "Ina Structor",
      status: CertificateStatus.REVOKED,
    });

    // An unknown code reveals nothing at all beyond "not valid".
    const unknown = await request(app).get("/api/certificates/verify/NOSUCHCODE00000");
    expect(unknown.status).toBe(200);
    expect(unknown.body.data).toEqual({ valid: false });

    // A revoked one is found and named, but explicitly not valid.
    const revoked = await request(app).get("/api/certificates/verify/REVOKEDTESTCODE1");
    expect(revoked.body.data).toMatchObject({
      valid: false,
      status: CertificateStatus.REVOKED,
      studentName: "Rev Oked",
    });
  });
});

describe("malformed input never crashes or leaks", () => {
  it("answers safely for invalid object ids on every :id route", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);

    const routes = [
      "/api/users/not-an-id",
      "/api/courses/not-an-id",
      "/api/modules/not-an-id",
      "/api/lessons/not-an-id",
      "/api/quizzes/not-an-id",
      "/api/certificates/not-an-id",
      "/api/enrollments/not-an-id",
    ];

    for (const url of routes) {
      const res = await request(app).get(url).set(auth(admin.token));
      expect([400, 403, 404], url).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(
        /mongodb\+srv|ObjectId\(|at Object\.|\.ts:\d+/
      );
    }

    const progress = await request(app)
      .get("/api/courses/not-an-id/progress")
      .set(auth(student.token));
    expect([400, 403, 404]).toContain(progress.status);
  });

  it("survives hostile query strings and rejects unsafe pagination", async () => {
    const admin = await createUser(UserRole.ADMIN);

    // Regex metacharacters must be treated as literals, not as a pattern.
    const hostile = await request(app)
      .get("/api/users?search=%28%5B%7B%2A%2B%3F&limit=10")
      .set(auth(admin.token));
    expect(hostile.status).toBe(200);

    for (const qs of [
      "page=0",
      "page=-5",
      "limit=0",
      "limit=-1",
      "limit=100000",
      "limit=abc",
      "sortBy=password",
      "sortOrder=;drop",
      "role=superadmin",
    ]) {
      const res = await request(app).get(`/api/users?${qs}`).set(auth(admin.token));
      expect(res.status, qs).toBe(400);
    }

    const ok = await request(app).get("/api/users?page=1&limit=100").set(auth(admin.token));
    expect(ok.status).toBe(200);
    expect(ok.body.data.length).toBeLessThanOrEqual(100);
  });

  it("rejects operator-injection objects where a string is expected", async () => {
    counter += 1;
    const email = `sec-nosql-${counter}@example.com`;
    await User.create({
      firstName: "No",
      lastName: "Sql",
      email,
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });

    // The classic NoSQL auth bypass: an operator object in place of a string.
    const injected = await request(app)
      .post("/api/auth/login")
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(injected.status).toBe(400);

    const partial = await request(app)
      .post("/api/auth/login")
      .send({ email, password: { $gt: "" } });
    expect(partial.status).toBe(400);
  });

  it("returns a JSON envelope for malformed bodies and unknown routes", async () => {
    const malformed = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "broken"');
    expect(malformed.status).toBe(400);
    expect(malformed.body.success).toBe(false);

    const missing = await request(app).get("/api/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
  });
});
