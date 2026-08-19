import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { Enrollment, EnrollmentStatus } from "../src/models/enrollment.model";
import { Module } from "../src/models/module.model";
import { Quiz } from "../src/models/quiz.model";
import { QuizAttempt } from "../src/models/quiz-attempt.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUser = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Quiz",
    lastName: `${role}${counter}`,
    email: `quiz-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const setupCourse = async ({ enroll = true }: { enroll?: boolean } = {}) => {
  const instructor = await createUser(UserRole.INSTRUCTOR);
  const student = await createUser(UserRole.STUDENT);

  counter += 1;
  const course = await Course.create({
    title: `Quiz Course ${counter}`,
    slug: `quiz-course-${counter}`,
    description: "A course used by quiz tests.",
    category: "programming",
    level: "beginner",
    instructor: instructor.user._id,
    status: CourseStatus.PUBLISHED,
  });
  const module = await Module.create({
    course: course._id,
    title: "Quiz Module",
    order: 1,
    isPublished: true,
  });

  if (enroll) {
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
  }

  return { instructor, student, course, module };
};

const quizBody = {
  title: "Fundamentals Check",
  description: "A short knowledge check.",
  passingScore: 70,
  isRequired: true,
  questions: [
    {
      questionText: "Which option is correct?",
      type: "multiple-choice",
      options: ["Alpha", "Beta", "Gamma"],
      correctAnswer: "Alpha",
      points: 10,
    },
    {
      questionText: "TypeScript is a superset of JavaScript.",
      type: "true-false",
      correctAnswer: "true",
      points: 10,
    },
  ],
};

/** Creates a published quiz through the API and returns its manage payload. */
const createPublishedQuiz = async (
  courseId: string,
  token: string,
  body: Record<string, unknown> = {}
) => {
  const created = await request(app)
    .post(`/api/courses/${courseId}/quizzes`)
    .set(auth(token))
    .send({ ...quizBody, ...body });
  const quiz = created.body.data.quiz;
  await request(app)
    .patch(`/api/quizzes/${quiz.id}/status`)
    .set(auth(token))
    .send({ isPublished: true });
  return quiz as {
    id: string;
    questions: { id: string; correctAnswer: string; points: number }[];
  };
};

describe("POST /api/courses/:courseId/quizzes", () => {
  it("creates an unpublished quiz with ordered questions and an answer key", async () => {
    const { instructor, course } = await setupCourse();

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);

    expect(res.status).toBe(201);
    const quiz = res.body.data.quiz;
    expect(quiz.isPublished).toBe(false);
    expect(quiz.isRequired).toBe(true);
    expect(quiz.questionCount).toBe(2);
    expect(quiz.totalPoints).toBe(20);
    expect(quiz.questions.map((q: { order: number }) => q.order)).toEqual([1, 2]);
    expect(quiz.questions[0].correctAnswer).toBe("Alpha");
    // True/false options are normalized server-side.
    expect(quiz.questions[1].options).toEqual(["true", "false"]);
  });

  it("lets an admin create a quiz on any course", async () => {
    const { course } = await setupCourse();
    const admin = await createUser(UserRole.ADMIN);

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(admin.token))
      .send(quizBody);

    expect(res.status).toBe(201);
  });

  it("blocks other instructors and students", async () => {
    const { course, student } = await setupCourse();
    const other = await createUser(UserRole.INSTRUCTOR);
    const url = `/api/courses/${course._id.toString()}/quizzes`;

    expect((await request(app).post(url).set(auth(other.token)).send(quizBody)).status).toBe(
      403
    );
    expect(
      (await request(app).post(url).set(auth(student.token)).send(quizBody)).status
    ).toBe(403);
    expect((await request(app).post(url).send(quizBody)).status).toBe(401);
  });

  it("rejects a module from a different course", async () => {
    const { instructor, course } = await setupCourse();
    const foreign = await setupCourse();

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, module: foreign.module._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different course/i);
  });

  it("accepts a module belonging to the same course", async () => {
    const { instructor, course, module } = await setupCourse();

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, module: module._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.quiz.module).toBe(module._id.toString());
  });

  it.each([
    ["missing title", { title: "" }],
    ["no questions", { questions: [] }],
    ["passing score above 100", { passingScore: 140 }],
    [
      "invalid question type",
      { questions: [{ ...quizBody.questions[0], type: "essay" }] },
    ],
    [
      "multiple choice with one option",
      { questions: [{ ...quizBody.questions[0], options: ["Only"] }] },
    ],
    [
      "multiple choice answer not among options",
      { questions: [{ ...quizBody.questions[0], correctAnswer: "Omega" }] },
    ],
    [
      "duplicate options",
      {
        questions: [
          { ...quizBody.questions[0], options: ["Alpha", "Alpha"], correctAnswer: "Alpha" },
        ],
      },
    ],
    [
      "true/false answer that isn't true or false",
      { questions: [{ ...quizBody.questions[1], correctAnswer: "maybe" }] },
    ],
    [
      "zero points",
      { questions: [{ ...quizBody.questions[0], points: 0 }] },
    ],
    [
      "negative points",
      { questions: [{ ...quizBody.questions[0], points: -5 }] },
    ],
    [
      "blank question text",
      { questions: [{ ...quizBody.questions[0], questionText: "" }] },
    ],
  ])("rejects invalid input: %s", async (_label, overrides) => {
    const { instructor, course } = await setupCourse();

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, ...overrides });

    expect(res.status).toBe(400);
  });
});

describe("quiz visibility", () => {
  it("shows staff every quiz and students only published ones", async () => {
    const { instructor, student, course } = await setupCourse();
    await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, title: "Draft Quiz" });
    await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Live Quiz",
    });

    const asInstructor = await request(app)
      .get(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token));
    const asStudent = await request(app)
      .get(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(student.token));

    expect(asInstructor.body.data).toHaveLength(2);
    expect(asStudent.body.data).toHaveLength(1);
    expect(asStudent.body.data[0].title).toBe("Live Quiz");
  });

  it("never exposes the answer key to students", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const list = await request(app)
      .get(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(student.token));
    const detail = await request(app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(auth(student.token));

    for (const question of list.body.data[0].questions) {
      expect(question.correctAnswer).toBeUndefined();
    }
    for (const question of detail.body.data.quiz.questions) {
      expect(question.correctAnswer).toBeUndefined();
      expect(question.id).toBeDefined();
      expect(question.options.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(detail.body)).not.toContain("correctAnswer");
  });

  it("keeps the answer key for the owning instructor and admins", async () => {
    const { instructor, course } = await setupCourse();
    const admin = await createUser(UserRole.ADMIN);
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const asInstructor = await request(app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(auth(instructor.token));
    const asAdmin = await request(app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(auth(admin.token));

    expect(asInstructor.body.data.quiz.questions[0].correctAnswer).toBe("Alpha");
    expect(asAdmin.body.data.quiz.questions[0].correctAnswer).toBe("Alpha");
  });

  it("hides unpublished quizzes from students", async () => {
    const { instructor, student, course } = await setupCourse();
    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);

    const res = await request(app)
      .get(`/api/quizzes/${created.body.data.quiz.id}`)
      .set(auth(student.token));

    expect(res.status).toBe(404);
  });

  it("requires an active enrollment for students", async () => {
    const { instructor, student, course } = await setupCourse({ enroll: false });
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const list = await request(app)
      .get(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(student.token));
    const detail = await request(app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(auth(student.token));

    expect(list.status).toBe(403);
    expect(detail.status).toBe(403);
  });

  it("hides quizzes from another instructor", async () => {
    const { instructor, course } = await setupCourse();
    const other = await createUser(UserRole.INSTRUCTOR);
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const list = await request(app)
      .get(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(other.token));
    const detail = await request(app)
      .get(`/api/quizzes/${quiz.id}`)
      .set(auth(other.token));

    expect(list.status).toBe(403);
    expect(detail.status).toBe(404);
  });
});

describe("GET /api/quizzes/my-quizzes", () => {
  it("lists published quizzes from every accessible course with the student's own results", async () => {
    const { instructor, student, course } = await setupCourse();
    const first = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Live Quiz A",
    });
    await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Live Quiz B",
    });

    await request(app)
      .post(`/api/quizzes/${first.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: first.questions[0].id, selectedAnswer: "Beta" }] });
    await request(app)
      .post(`/api/quizzes/${first.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: first.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: first.questions[1].id, selectedAnswer: "true" },
        ],
      });

    const res = await request(app)
      .get("/api/quizzes/my-quizzes")
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    const attempted = res.body.data.find(
      (quiz: { title: string }) => quiz.title === "Live Quiz A"
    );
    expect(attempted).toMatchObject({
      courseId: course._id.toString(),
      courseTitle: course.title,
      attemptCount: 2,
      bestPercentage: 100,
      passed: true,
      questionCount: 2,
      passingScore: 70,
    });

    const untouched = res.body.data.find(
      (quiz: { title: string }) => quiz.title === "Live Quiz B"
    );
    expect(untouched).toMatchObject({
      attemptCount: 0,
      bestPercentage: null,
      passed: false,
    });

    expect(JSON.stringify(res.body)).not.toContain("correctAnswer");
  });

  it("excludes unpublished quizzes, unpublished courses and cancelled enrollments", async () => {
    const { instructor, student, course } = await setupCourse();
    await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, title: "Draft Quiz" });
    await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Published Quiz",
    });
    const url = "/api/quizzes/my-quizzes";

    const published = await request(app).get(url).set(auth(student.token));
    expect(published.body.data).toHaveLength(1);
    expect(published.body.data[0].title).toBe("Published Quiz");

    // A course pulled back to draft hides its quizzes again.
    await Course.updateOne({ _id: course._id }, { status: CourseStatus.DRAFT });
    expect((await request(app).get(url).set(auth(student.token))).body.data).toHaveLength(0);

    await Course.updateOne({ _id: course._id }, { status: CourseStatus.PUBLISHED });
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED }
    );
    expect((await request(app).get(url).set(auth(student.token))).body.data).toHaveLength(0);
  });

  it("keeps a completed enrollment's quizzes visible", async () => {
    const { instructor, student, course } = await setupCourse();
    await createPublishedQuiz(course._id.toString(), instructor.token);
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.COMPLETED }
    );

    const res = await request(app)
      .get("/api/quizzes/my-quizzes")
      .set(auth(student.token));

    expect(res.body.data).toHaveLength(1);
  });

  it("never leaks another student's attempts", async () => {
    const { instructor, student, course } = await setupCourse();
    const other = await createUser(UserRole.STUDENT);
    await Enrollment.create({
      student: other.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }] });

    const theirs = await request(app)
      .get("/api/quizzes/my-quizzes")
      .set(auth(other.token));

    expect(theirs.body.data[0]).toMatchObject({
      attemptCount: 0,
      bestPercentage: null,
      passed: false,
    });
  });

  it("returns an empty list for a student with no enrollments", async () => {
    const { instructor, student, course } = await setupCourse({ enroll: false });
    await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .get("/api/quizzes/my-quizzes")
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("is student-only and requires a session", async () => {
    const { instructor } = await setupCourse();
    const admin = await createUser(UserRole.ADMIN);
    const url = "/api/quizzes/my-quizzes";

    expect((await request(app).get(url).set(auth(instructor.token))).status).toBe(403);
    expect((await request(app).get(url).set(auth(admin.token))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe("PUT / PATCH / DELETE /api/quizzes/:id", () => {
  it("updates fields and replaces the question set", async () => {
    const { instructor, course } = await setupCourse();
    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);

    const res = await request(app)
      .put(`/api/quizzes/${created.body.data.quiz.id}`)
      .set(auth(instructor.token))
      .send({
        title: "Renamed Quiz",
        passingScore: 50,
        isRequired: false,
        questions: [
          {
            questionText: "Only question now",
            type: "true-false",
            correctAnswer: "false",
            points: 5,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.quiz).toMatchObject({
      title: "Renamed Quiz",
      passingScore: 50,
      isRequired: false,
      questionCount: 1,
      totalPoints: 5,
    });
  });

  it("refuses to attach a module from another course on update", async () => {
    const { instructor, course, module } = await setupCourse();
    const foreign = await setupCourse();
    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);
    const url = `/api/quizzes/${created.body.data.quiz.id}`;

    const rejected = await request(app)
      .put(url)
      .set(auth(instructor.token))
      .send({ module: foreign.module._id.toString() });
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toMatch(/different course/i);

    const accepted = await request(app)
      .put(url)
      .set(auth(instructor.token))
      .send({ module: module._id.toString() });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.quiz.module).toBe(module._id.toString());

    // An empty string detaches it again.
    const cleared = await request(app)
      .put(url)
      .set(auth(instructor.token))
      .send({ module: "" });
    expect(cleared.body.data.quiz.module).toBeNull();
  });

  it("publishes and unpublishes", async () => {
    const { instructor, course } = await setupCourse();
    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);
    const id = created.body.data.quiz.id;

    const publish = await request(app)
      .patch(`/api/quizzes/${id}/status`)
      .set(auth(instructor.token))
      .send({ isPublished: true });
    expect(publish.body.message).toBe("Quiz published");
    expect(publish.body.data.quiz.isPublished).toBe(true);

    const unpublish = await request(app)
      .patch(`/api/quizzes/${id}/status`)
      .set(auth(instructor.token))
      .send({ isPublished: false });
    expect(unpublish.body.message).toBe("Quiz unpublished");
  });

  it("blocks another instructor and students from editing", async () => {
    const { instructor, student, course } = await setupCourse();
    const other = await createUser(UserRole.INSTRUCTOR);
    const created = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send(quizBody);
    const url = `/api/quizzes/${created.body.data.quiz.id}`;

    expect(
      (await request(app).put(url).set(auth(other.token)).send({ title: "Hijacked" })).status
    ).toBe(403);
    expect(
      (await request(app).put(url).set(auth(student.token)).send({ title: "Hijacked" }))
        .status
    ).toBe(403);
  });

  it("deletes a quiz with no attempts and refuses once it has been taken", async () => {
    const { instructor, student, course } = await setupCourse();
    const clean = await request(app)
      .post(`/api/courses/${course._id.toString()}/quizzes`)
      .set(auth(instructor.token))
      .send({ ...quizBody, title: "Never Taken" });

    const removed = await request(app)
      .delete(`/api/quizzes/${clean.body.data.quiz.id}`)
      .set(auth(instructor.token));
    expect(removed.status).toBe(200);

    const taken = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Attempted Quiz",
    });
    await request(app)
      .post(`/api/quizzes/${taken.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [{ questionId: taken.questions[0].id, selectedAnswer: "Alpha" }],
      });

    const blocked = await request(app)
      .delete(`/api/quizzes/${taken.id}`)
      .set(auth(instructor.token));
    expect(blocked.status).toBe(409);
    expect(await Quiz.findById(taken.id)).not.toBeNull();
  });
});

describe("POST /api/quizzes/:id/submit", () => {
  it("scores a fully correct submission and marks it passed", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[1].id, selectedAnswer: "true" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.result).toMatchObject({
      score: 20,
      totalPoints: 20,
      percentage: 100,
      passed: true,
    });
    expect(res.body.data.courseProgress).toBeDefined();
  });

  it("scores an incorrect submission as failed", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Beta" },
          { questionId: quiz.questions[1].id, selectedAnswer: "false" },
        ],
      });

    expect(res.body.data.result).toMatchObject({
      score: 0,
      percentage: 0,
      passed: false,
    });
  });

  it("computes a partial percentage and honours the passing score", async () => {
    const { instructor, student, course } = await setupCourse();
    const strict = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Strict Quiz",
      passingScore: 70,
    });
    const lenient = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Lenient Quiz",
      passingScore: 50,
    });

    const halfRight = (quiz: typeof strict) => ({
      answers: [
        { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
        { questionId: quiz.questions[1].id, selectedAnswer: "false" },
      ],
    });

    const strictRes = await request(app)
      .post(`/api/quizzes/${strict.id}/submit`)
      .set(auth(student.token))
      .send(halfRight(strict));
    const lenientRes = await request(app)
      .post(`/api/quizzes/${lenient.id}/submit`)
      .set(auth(student.token))
      .send(halfRight(lenient));

    expect(strictRes.body.data.result).toMatchObject({ percentage: 50, passed: false });
    expect(lenientRes.body.data.result).toMatchObject({ percentage: 50, passed: true });
  });

  it("ignores any score the client tries to supply", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        score: 999,
        percentage: 100,
        passed: true,
        answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }],
      });

    expect(res.body.data.result).toMatchObject({
      score: 0,
      totalPoints: 20,
      percentage: 0,
      passed: false,
    });
    const stored = await QuizAttempt.findById(res.body.data.result.attemptId);
    expect(stored?.score).toBe(0);
  });

  it("treats unanswered questions as incorrect", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }],
      });

    expect(res.body.data.result).toMatchObject({ score: 10, percentage: 50 });
  });

  it("allows multiple attempts and keeps every one", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);
    const url = `/api/quizzes/${quiz.id}/submit`;

    await request(app)
      .post(url)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });
    const second = await request(app)
      .post(url)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[1].id, selectedAnswer: "true" },
        ],
      });

    expect(second.body.data.result.passed).toBe(true);
    expect(await QuizAttempt.countDocuments({ quiz: quiz.id })).toBe(2);
  });

  it.each([
    ["unknown question id", "64b2fa8a0f1b2c3d4e5f6a7b"],
    ["invalid question id", "not-an-id"],
  ])("rejects answers with an %s", async (_label, questionId) => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId, selectedAnswer: "Alpha" }] });

    expect(res.status).toBe(400);
  });

  it("rejects an answer whose question belongs to a different quiz", async () => {
    const { instructor, student, course } = await setupCourse();
    const target = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Target Quiz",
    });
    const other = await createPublishedQuiz(course._id.toString(), instructor.token, {
      title: "Other Quiz",
    });

    const res = await request(app)
      .post(`/api/quizzes/${target.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [{ questionId: other.questions[0].id, selectedAnswer: "Alpha" }],
      });

    expect(res.status).toBe(400);
    expect(await QuizAttempt.countDocuments()).toBe(0);
  });

  it("rejects duplicate answers for one question", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    const res = await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[0].id, selectedAnswer: "Beta" },
        ],
      });

    expect(res.status).toBe(400);
  });

  it("refuses unpublished quizzes, missing enrollments and non-students", async () => {
    const { instructor, student, course } = await setupCourse();
    const admin = await createUser(UserRole.ADMIN);
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);
    const body = {
      answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }],
    };
    const url = `/api/quizzes/${quiz.id}/submit`;

    expect((await request(app).post(url).set(auth(admin.token)).send(body)).status).toBe(403);
    expect(
      (await request(app).post(url).set(auth(instructor.token)).send(body)).status
    ).toBe(403);
    expect((await request(app).post(url).send(body)).status).toBe(401);

    await Quiz.updateOne({ _id: quiz.id }, { isPublished: false });
    expect((await request(app).post(url).set(auth(student.token)).send(body)).status).toBe(
      404
    );

    await Quiz.updateOne({ _id: quiz.id }, { isPublished: true });
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED }
    );
    expect((await request(app).post(url).set(auth(student.token)).send(body)).status).toBe(
      403
    );
  });
});

describe("quiz results", () => {
  it("returns a student their own attempt history, best score and pass state", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);
    const url = `/api/quizzes/${quiz.id}/submit`;

    await request(app)
      .post(url)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });
    await request(app)
      .post(url)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[1].id, selectedAnswer: "true" },
        ],
      });

    const res = await request(app)
      .get(`/api/quizzes/${quiz.id}/my-results`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      attemptCount: 2,
      bestPercentage: 100,
      passed: true,
      passingScore: 70,
    });
    expect(res.body.data.attempts).toHaveLength(2);
    // Newest first.
    expect(res.body.data.attempts[0].percentage).toBe(100);
    expect(JSON.stringify(res.body)).not.toContain("correctAnswer");
  });

  it("keeps one student's attempts out of another's results", async () => {
    const { instructor, student, course } = await setupCourse();
    const other = await createUser(UserRole.STUDENT);
    await Enrollment.create({
      student: other.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Alpha" }] });

    const mine = await request(app)
      .get(`/api/quizzes/${quiz.id}/my-results`)
      .set(auth(student.token));
    const theirs = await request(app)
      .get(`/api/quizzes/${quiz.id}/my-results`)
      .set(auth(other.token));

    expect(mine.body.data.attemptCount).toBe(1);
    expect(theirs.body.data.attemptCount).toBe(0);
    expect(theirs.body.data.bestPercentage).toBeNull();
  });

  it("gives the owning instructor every attempt with a summary", async () => {
    const { instructor, student, course } = await setupCourse();
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[1].id, selectedAnswer: "true" },
        ],
      });

    const res = await request(app)
      .get(`/api/quizzes/${quiz.id}/results`)
      .set(auth(instructor.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].student.email).toBe(student.user.email);
    expect(res.body.data[0].student.password).toBeUndefined();
    expect(res.body.summary).toMatchObject({
      totalAttempts: 1,
      studentsAttempted: 1,
      studentsPassed: 1,
      averagePercentage: 100,
    });
    expect(res.body.pagination.total).toBe(1);
  });

  it("blocks students and other instructors from the results endpoint", async () => {
    const { instructor, student, course } = await setupCourse();
    const other = await createUser(UserRole.INSTRUCTOR);
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);
    const url = `/api/quizzes/${quiz.id}/results`;

    expect((await request(app).get(url).set(auth(student.token))).status).toBe(403);
    expect((await request(app).get(url).set(auth(other.token))).status).toBe(403);
  });

  it("lets an admin list attempts platform-wide with filters", async () => {
    const { instructor, student, course } = await setupCourse();
    const admin = await createUser(UserRole.ADMIN);
    const quiz = await createPublishedQuiz(course._id.toString(), instructor.token);

    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({ answers: [{ questionId: quiz.questions[0].id, selectedAnswer: "Beta" }] });
    await request(app)
      .post(`/api/quizzes/${quiz.id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0].id, selectedAnswer: "Alpha" },
          { questionId: quiz.questions[1].id, selectedAnswer: "true" },
        ],
      });

    const all = await request(app).get("/api/quiz-attempts").set(auth(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0].quizTitle).toBeTruthy();

    const passedOnly = await request(app)
      .get("/api/quiz-attempts?passed=true")
      .set(auth(admin.token));
    expect(passedOnly.body.data).toHaveLength(1);

    const byQuiz = await request(app)
      .get(`/api/quiz-attempts?quiz=${quiz.id}&limit=1`)
      .set(auth(admin.token));
    expect(byQuiz.body.data).toHaveLength(1);
    expect(byQuiz.body.pagination.total).toBe(2);

    const asStudent = await request(app)
      .get("/api/quiz-attempts")
      .set(auth(student.token));
    expect(asStudent.status).toBe(403);
  });
});
