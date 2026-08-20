/**
 * End-to-end journey: the whole LMS driven through the public HTTP API only,
 * with no direct database writes. Nothing is seeded except the first admin —
 * every course, lesson, quiz, enrolment, attempt and certificate below is
 * created by the same calls the web app makes.
 *
 * If this suite passes, the product works end to end. If a Phase 1–7 contract
 * silently changes, this is what catches it.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Certificate } from "../src/models/certificate.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The one thing a real deployment seeds out of band. */
const seedAdmin = async () => {
  const admin = await User.create({
    firstName: "Ada",
    lastName: "Admin",
    email: "journey-admin@example.com",
    password: "sufficiently-long-password",
    role: UserRole.ADMIN,
  });
  return signToken({ userId: admin._id.toString(), role: UserRole.ADMIN });
};

describe("full LMS journey", () => {
  it("takes a student from registration to a verified certificate", async () => {
    const adminToken = await seedAdmin();

    // ---- Admin provisions an instructor -------------------------------
    const instructorCreated = await request(app)
      .post("/api/users")
      .set(auth(adminToken))
      .send({
        firstName: "Ivan",
        lastName: "Instructor",
        email: "journey-instructor@example.com",
        password: "sufficiently-long-password",
        role: "instructor",
      });
    expect(instructorCreated.status).toBe(201);
    expect(instructorCreated.body.data.user.role).toBe("instructor");
    expect(JSON.stringify(instructorCreated.body)).not.toContain("$2b$");

    const instructorLogin = await request(app).post("/api/auth/login").send({
      email: "journey-instructor@example.com",
      password: "sufficiently-long-password",
    });
    expect(instructorLogin.status).toBe(200);
    const instructorToken = instructorLogin.body.data.token as string;

    // ---- Admin creates a course and assigns the instructor ------------
    const courseCreated = await request(app)
      .post("/api/courses")
      .set(auth(adminToken))
      .send({
        title: "Test-Driven TypeScript",
        description: "Everything from types to green tests, end to end.",
        shortDescription: "Types and tests.",
        category: "programming",
        level: "beginner",
        instructor: instructorCreated.body.data.user.id,
      });
    expect(courseCreated.status).toBe(201);
    const course = courseCreated.body.data.course;
    const courseId = course.id as string;
    expect(course.status).toBe("draft");
    expect(course.slug).toBe("test-driven-typescript");

    // ---- Instructor builds the content -------------------------------
    const moduleCreated = await request(app)
      .post(`/api/courses/${courseId}/modules`)
      .set(auth(instructorToken))
      .send({ title: "Foundations", description: "The basics." });
    expect(moduleCreated.status).toBe(201);
    const moduleId = moduleCreated.body.data.module.id as string;
    expect(moduleCreated.body.data.module.order).toBe(1);

    const lessonIds: string[] = [];
    for (const [index, title] of ["Why Types", "Writing a First Test"].entries()) {
      const lesson = await request(app)
        .post(`/api/modules/${moduleId}/lessons`)
        .set(auth(instructorToken))
        .send({ title, type: "text", content: `Body of ${title}.` });
      expect(lesson.status).toBe(201);
      expect(lesson.body.data.lesson.order).toBe(index + 1);
      expect(lesson.body.data.lesson.isPublished).toBe(false);
      lessonIds.push(lesson.body.data.lesson.id);
    }

    const quizCreated = await request(app)
      .post(`/api/courses/${courseId}/quizzes`)
      .set(auth(instructorToken))
      .send({
        title: "Foundations Check",
        module: moduleId,
        passingScore: 70,
        isRequired: true,
        questions: [
          {
            questionText: "TypeScript compiles to which language?",
            type: "multiple-choice",
            options: ["JavaScript", "WebAssembly", "Python"],
            correctAnswer: "JavaScript",
            points: 10,
          },
          {
            questionText: "Strict mode catches more errors.",
            type: "true-false",
            correctAnswer: "true",
            points: 10,
          },
        ],
      });
    expect(quizCreated.status).toBe(201);
    const quiz = quizCreated.body.data.quiz;
    const quizId = quiz.id as string;
    const questionIds = (quiz.questions as { id: string }[]).map((q) => q.id);

    // ---- Publish the chain: lessons, module, quiz, course -------------
    for (const lessonId of lessonIds) {
      const published = await request(app)
        .patch(`/api/lessons/${lessonId}/status`)
        .set(auth(instructorToken))
        .send({ isPublished: true });
      expect(published.status).toBe(200);
    }
    expect(
      (
        await request(app)
          .patch(`/api/modules/${moduleId}/status`)
          .set(auth(instructorToken))
          .send({ isPublished: true })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/quizzes/${quizId}/status`)
          .set(auth(instructorToken))
          .send({ isPublished: true })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`/api/courses/${courseId}/status`)
          .set(auth(instructorToken))
          .send({ status: "published" })
      ).status
    ).toBe(200);

    // ---- A student registers themselves ------------------------------
    const registered = await request(app).post("/api/auth/register").send({
      firstName: "Sam",
      lastName: "Student",
      email: "journey-student@example.com",
      password: "sufficiently-long-password",
    });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.role).toBe("student");
    const studentToken = registered.body.data.token as string;

    // ---- Browse the public catalog -----------------------------------
    const catalog = await request(app).get("/api/courses");
    expect(catalog.status).toBe(200);
    expect(
      (catalog.body.data as { id: string }[]).some((entry) => entry.id === courseId)
    ).toBe(true);

    // Before enrolling, the content is closed.
    expect(
      (await request(app).get(`/api/lessons/${lessonIds[0]}`).set(auth(studentToken)))
        .status
    ).toBe(403);

    // ---- Enroll --------------------------------------------------------
    const enrolled = await request(app)
      .post(`/api/courses/${courseId}/enroll`)
      .set(auth(studentToken));
    expect(enrolled.status).toBe(201);
    expect(enrolled.body.data.enrollment.status).toBe("active");

    // Enrolling twice is refused, not duplicated.
    const again = await request(app)
      .post(`/api/courses/${courseId}/enroll`)
      .set(auth(studentToken));
    expect(again.status).toBe(409);

    // ---- Learn ---------------------------------------------------------
    const firstLesson = await request(app)
      .get(`/api/lessons/${lessonIds[0]}`)
      .set(auth(studentToken));
    expect(firstLesson.status).toBe(200);
    expect(firstLesson.body.data.lesson.content).toBe("Body of Why Types.");

    const startingProgress = await request(app)
      .get(`/api/courses/${courseId}/progress`)
      .set(auth(studentToken));
    // Two lessons plus one required quiz.
    expect(startingProgress.body.data.progress).toMatchObject({
      totalLessons: 2,
      totalRequiredQuizzes: 1,
      totalRequiredItems: 3,
      completedRequiredItems: 0,
      progressPercentage: 0,
      isCompleted: false,
    });

    const afterFirst = await request(app)
      .post(`/api/lessons/${lessonIds[0]}/complete`)
      .set(auth(studentToken));
    expect(afterFirst.status).toBe(200);
    expect(afterFirst.body.data.courseProgress.progressPercentage).toBe(33);

    // ---- Take the quiz: fail, then pass --------------------------------
    const studentQuiz = await request(app)
      .get(`/api/quizzes/${quizId}`)
      .set(auth(studentToken));
    expect(studentQuiz.status).toBe(200);
    expect(JSON.stringify(studentQuiz.body)).not.toContain("correctAnswer");

    const failed = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set(auth(studentToken))
      .send({
        answers: [
          { questionId: questionIds[0], selectedAnswer: "Python" },
          { questionId: questionIds[1], selectedAnswer: "false" },
        ],
      });
    expect(failed.status).toBe(201);
    expect(failed.body.data.result).toMatchObject({ percentage: 0, passed: false });
    expect(failed.body.data.courseProgress.progressPercentage).toBe(33);

    const passed = await request(app)
      .post(`/api/quizzes/${quizId}/submit`)
      .set(auth(studentToken))
      .send({
        answers: [
          { questionId: questionIds[0], selectedAnswer: "JavaScript" },
          { questionId: questionIds[1], selectedAnswer: "true" },
        ],
      });
    expect(passed.status).toBe(201);
    expect(passed.body.data.result).toMatchObject({ percentage: 100, passed: true });
    expect(passed.body.data.courseProgress.progressPercentage).toBe(67);

    // Both attempts are kept, and the pass stands.
    const myResults = await request(app)
      .get(`/api/quizzes/${quizId}/my-results`)
      .set(auth(studentToken));
    expect(myResults.body.data).toMatchObject({
      attemptCount: 2,
      bestPercentage: 100,
      passed: true,
    });

    // ---- Finish the last lesson: the course completes ------------------
    const completing = await request(app)
      .post(`/api/lessons/${lessonIds[1]}/complete`)
      .set(auth(studentToken));
    expect(completing.status).toBe(200);
    expect(completing.body.data.courseProgress).toMatchObject({
      completedRequiredItems: 3,
      progressPercentage: 100,
      isCompleted: true,
      certificateAvailable: true,
    });

    // ---- The certificate was issued automatically ----------------------
    const certificates = await request(app)
      .get("/api/certificates")
      .set(auth(studentToken));
    expect(certificates.status).toBe(200);
    expect(certificates.body.data).toHaveLength(1);
    const certificate = certificates.body.data[0];
    expect(certificate).toMatchObject({
      studentName: "Sam Student",
      courseTitle: "Test-Driven TypeScript",
      instructorName: "Ivan Instructor",
      status: "active",
    });
    expect(certificate.certificateNumber).toMatch(/^LMS-\d{4}-\d{6}$/);

    // Issuing is idempotent — finishing again does not mint a second one.
    await request(app)
      .post(`/api/lessons/${lessonIds[1]}/complete`)
      .set(auth(studentToken));
    expect(await Certificate.countDocuments()).toBe(1);

    // ---- Download the PDF ----------------------------------------------
    const pdf = await request(app)
      .get(`/api/certificates/${certificate.id}/download`)
      .set(auth(studentToken));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");

    // ---- Verify it publicly, with no session at all ---------------------
    const verified = await request(app).get(
      `/api/certificates/verify/${certificate.verificationCode}`
    );
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({
      valid: true,
      studentName: "Sam Student",
      courseTitle: "Test-Driven TypeScript",
    });

    // ---- An admin revokes it; verification turns invalid ----------------
    const revoked = await request(app)
      .patch(`/api/certificates/${certificate.id}/status`)
      .set(auth(adminToken))
      .send({ status: "revoked" });
    expect(revoked.status).toBe(200);

    const afterRevoke = await request(app).get(
      `/api/certificates/verify/${certificate.verificationCode}`
    );
    expect(afterRevoke.body.data.valid).toBe(false);
    expect(afterRevoke.body.data.status).toBe("revoked");

    // The record survives revocation — it is never deleted.
    expect(await Certificate.countDocuments()).toBe(1);
  });

  it("blocks every step for the wrong actor", async () => {
    const adminToken = await seedAdmin();

    // Two instructors, each with their own course.
    const makeInstructor = async (suffix: string) => {
      const created = await request(app)
        .post("/api/users")
        .set(auth(adminToken))
        .send({
          firstName: "Ins",
          lastName: suffix,
          email: `journey-ins-${suffix}@example.com`,
          password: "sufficiently-long-password",
          role: "instructor",
        });
      const login = await request(app).post("/api/auth/login").send({
        email: `journey-ins-${suffix}@example.com`,
        password: "sufficiently-long-password",
      });
      return { id: created.body.data.user.id as string, token: login.body.data.token as string };
    };

    const owner = await makeInstructor("owner");
    const rival = await makeInstructor("rival");

    const course = await request(app)
      .post("/api/courses")
      .set(auth(adminToken))
      .send({
        title: "Owned Course",
        description: "A course with exactly one rightful owner.",
        category: "programming",
        level: "beginner",
        instructor: owner.id,
      });
    const courseId = course.body.data.course.id as string;

    // A rival instructor cannot touch it.
    expect(
      (
        await request(app)
          .put(`/api/courses/${courseId}`)
          .set(auth(rival.token))
          .send({ title: "Taken Over" })
      ).status
    ).toBe(403);

    // A student cannot reach admin endpoints.
    const student = await request(app).post("/api/auth/register").send({
      firstName: "Sam",
      lastName: "Student",
      email: "journey-outsider@example.com",
      password: "sufficiently-long-password",
    });
    const studentToken = student.body.data.token as string;
    expect((await request(app).get("/api/users").set(auth(studentToken))).status).toBe(403);

    // A deactivated student cannot log in at all.
    const deactivated = await request(app)
      .patch(`/api/users/${student.body.data.user.id}/status`)
      .set(auth(adminToken))
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);

    const blockedLogin = await request(app).post("/api/auth/login").send({
      email: "journey-outsider@example.com",
      password: "sufficiently-long-password",
    });
    expect(blockedLogin.status).toBe(403);

    // And their existing token stops working immediately.
    expect((await request(app).get("/api/auth/me").set(auth(studentToken))).status).toBe(403);
  });
});
