import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { Enrollment, EnrollmentStatus } from "../src/models/enrollment.model";
import { Lesson, LessonDocument, LessonType } from "../src/models/lesson.model";
import { LessonProgress } from "../src/models/lesson-progress.model";
import { Module } from "../src/models/module.model";
import { QuestionType, Quiz } from "../src/models/quiz.model";
import { QuizAttempt } from "../src/models/quiz-attempt.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUser = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Prog",
    lastName: `${role}${counter}`,
    email: `prog-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Published course + published module + N published lessons + enrolled student. */
const setupCourse = async ({
  lessons = 2,
  enroll = true,
  modulePublished = true,
}: { lessons?: number; enroll?: boolean; modulePublished?: boolean } = {}) => {
  const instructor = await createUser(UserRole.INSTRUCTOR);
  const student = await createUser(UserRole.STUDENT);

  counter += 1;
  const course = await Course.create({
    title: `Progress Course ${counter}`,
    slug: `progress-course-${counter}`,
    description: "A course used by progress tests.",
    category: "programming",
    level: "beginner",
    instructor: instructor.user._id,
    status: CourseStatus.PUBLISHED,
  });
  const module = await Module.create({
    course: course._id,
    title: "Progress Module",
    order: 1,
    isPublished: modulePublished,
  });

  const created: LessonDocument[] = [];
  for (let index = 0; index < lessons; index += 1) {
    // Sequential so lesson order is deterministic.
    created.push(
      await Lesson.create({
        module: module._id,
        course: course._id,
        title: `Lesson ${index + 1}`,
        type: LessonType.TEXT,
        content: "Lesson body content.",
        order: index + 1,
        isPublished: true,
      })
    );
  }

  if (enroll) {
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
  }

  return { instructor, student, course, module, lessons: created };
};

const createRequiredQuiz = async (
  courseId: unknown,
  moduleId: unknown,
  overrides: Record<string, unknown> = {}
) =>
  Quiz.create({
    course: courseId,
    module: moduleId,
    title: `Required Quiz ${++counter}`,
    passingScore: 70,
    isRequired: true,
    isPublished: true,
    questions: [
      {
        questionText: "Is this a required quiz?",
        type: QuestionType.TRUE_FALSE,
        options: ["true", "false"],
        correctAnswer: "true",
        points: 10,
        order: 1,
      },
    ],
    ...overrides,
  });

describe("POST /api/lessons/:lessonId/complete", () => {
  it("marks a lesson complete and returns updated course progress", async () => {
    const { student, lessons } = await setupCourse({ lessons: 2 });

    const res = await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.progress.isCompleted).toBe(true);
    expect(res.body.data.progress.completedAt).toBeDefined();
    expect(res.body.data.courseProgress).toMatchObject({
      totalLessons: 2,
      completedLessons: 1,
      totalRequiredItems: 2,
      completedRequiredItems: 1,
      progressPercentage: 50,
      isCompleted: false,
    });
  });

  it("is idempotent — repeat calls keep a single record", async () => {
    const { student, lessons } = await setupCourse({ lessons: 2 });
    const url = `/api/lessons/${lessons[0]._id.toString()}/complete`;

    await request(app).post(url).set(auth(student.token));
    const second = await request(app).post(url).set(auth(student.token));

    expect(second.status).toBe(200);
    expect(second.body.data.courseProgress.completedLessons).toBe(1);
    expect(await LessonProgress.countDocuments({ student: student.user._id })).toBe(1);
  });

  it("derives student, course and module from the request context", async () => {
    const { student, course, module, lessons } = await setupCourse({ lessons: 1 });
    const other = await createUser(UserRole.STUDENT);

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      // A spoofed student id in the body must be ignored.
      .set(auth(student.token))
      .send({ student: other.user._id.toString(), isCompleted: true });

    const record = await LessonProgress.findOne({ lesson: lessons[0]._id });
    expect(record?.student.toString()).toBe(student.user._id.toString());
    expect(record?.course.toString()).toBe(course._id.toString());
    expect(record?.module.toString()).toBe(module._id.toString());
  });

  it("rejects students without an active enrollment", async () => {
    const { student, lessons } = await setupCourse({ lessons: 1, enroll: false });

    const res = await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    expect(res.status).toBe(403);
  });

  it("rejects a student whose enrollment was cancelled", async () => {
    const { student, course, lessons } = await setupCourse({ lessons: 1 });
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED }
    );

    const res = await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    expect(res.status).toBe(403);
  });

  it("rejects instructors, admins and anonymous callers", async () => {
    const { instructor, lessons } = await setupCourse({ lessons: 1 });
    const admin = await createUser(UserRole.ADMIN);
    const url = `/api/lessons/${lessons[0]._id.toString()}/complete`;

    expect((await request(app).post(url).set(auth(instructor.token))).status).toBe(403);
    expect((await request(app).post(url).set(auth(admin.token))).status).toBe(403);
    expect((await request(app).post(url)).status).toBe(401);
  });

  it("hides unpublished lessons and modules behind a 404", async () => {
    const published = await setupCourse({ lessons: 1 });
    await Lesson.updateOne({ _id: published.lessons[0]._id }, { isPublished: false });
    const draftLesson = await request(app)
      .post(`/api/lessons/${published.lessons[0]._id.toString()}/complete`)
      .set(auth(published.student.token));
    expect(draftLesson.status).toBe(404);

    const hidden = await setupCourse({ lessons: 1, modulePublished: false });
    const inHiddenModule = await request(app)
      .post(`/api/lessons/${hidden.lessons[0]._id.toString()}/complete`)
      .set(auth(hidden.student.token));
    expect(inHiddenModule.status).toBe(404);
  });

  it("rejects invalid and unknown lesson ids", async () => {
    const { student } = await setupCourse({ lessons: 1 });

    const invalid = await request(app)
      .post("/api/lessons/not-an-id/complete")
      .set(auth(student.token));
    const missing = await request(app)
      .post("/api/lessons/64b2fa8a0f1b2c3d4e5f6a7b/complete")
      .set(auth(student.token));

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /api/lessons/:lessonId/progress", () => {
  it("marks a lesson incomplete again", async () => {
    const { student, lessons } = await setupCourse({ lessons: 2 });
    const lessonId = lessons[0]._id.toString();

    await request(app).post(`/api/lessons/${lessonId}/complete`).set(auth(student.token));

    const res = await request(app)
      .patch(`/api/lessons/${lessonId}/progress`)
      .set(auth(student.token))
      .send({ isCompleted: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Lesson marked incomplete");
    expect(res.body.data.progress.isCompleted).toBe(false);
    expect(res.body.data.progress.completedAt).toBeUndefined();
    expect(res.body.data.courseProgress.completedLessons).toBe(0);

    const record = await LessonProgress.findOne({ lesson: lessons[0]._id });
    expect(record?.isCompleted).toBe(false);
    expect(record?.completedAt).toBeUndefined();
  });

  it("validates the payload", async () => {
    const { student, lessons } = await setupCourse({ lessons: 1 });

    const res = await request(app)
      .patch(`/api/lessons/${lessons[0]._id.toString()}/progress`)
      .set(auth(student.token))
      .send({ isCompleted: "yes" });

    expect(res.status).toBe(400);
  });

  it("ignores course-level progress values supplied by the client", async () => {
    const { student, lessons } = await setupCourse({ lessons: 2 });

    const res = await request(app)
      .patch(`/api/lessons/${lessons[0]._id.toString()}/progress`)
      .set(auth(student.token))
      .send({
        isCompleted: true,
        // None of these may influence the stored or returned figures.
        progressPercentage: 100,
        completedLessons: 99,
        completedRequiredItems: 99,
        totalRequiredItems: 1,
        isCourseCompleted: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.courseProgress).toMatchObject({
      totalLessons: 2,
      completedLessons: 1,
      totalRequiredItems: 2,
      completedRequiredItems: 1,
      progressPercentage: 50,
      isCompleted: false,
    });
  });

  it("completes the lesson even if the body claims otherwise on /complete", async () => {
    const { student, lessons } = await setupCourse({ lessons: 2 });

    const res = await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token))
      .send({ isCompleted: false, progressPercentage: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.progress.isCompleted).toBe(true);
    expect(res.body.data.courseProgress.completedLessons).toBe(1);
  });
});

describe("GET /api/lessons/:lessonId/progress", () => {
  it("reports not-completed before anything happens", async () => {
    const { student, lessons } = await setupCourse({ lessons: 1 });

    const res = await request(app)
      .get(`/api/lessons/${lessons[0]._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.progress.isCompleted).toBe(false);
  });
});

describe("GET /api/courses/:courseId/progress", () => {
  it("counts published lessons and required quizzes as the denominator", async () => {
    const { student, course, module, lessons } = await setupCourse({ lessons: 2 });
    await createRequiredQuiz(course._id, module._id);
    // Optional quizzes never change the denominator.
    await createRequiredQuiz(course._id, module._id, { isRequired: false });

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toMatchObject({
      totalLessons: 2,
      completedLessons: 1,
      totalRequiredQuizzes: 1,
      passedRequiredQuizzes: 0,
      totalRequiredItems: 3,
      completedRequiredItems: 1,
      progressPercentage: 33,
      isCompleted: false,
    });
  });

  it("excludes unpublished lessons from the total", async () => {
    const { student, course, module } = await setupCourse({ lessons: 1 });
    await Lesson.create({
      module: module._id,
      course: course._id,
      title: "Hidden Lesson",
      type: LessonType.TEXT,
      content: "Not published yet.",
      order: 2,
      isPublished: false,
    });

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.body.data.progress.totalLessons).toBe(1);
    expect(res.body.data.progress.totalRequiredItems).toBe(1);
  });

  it("ignores quizzes attached to an unpublished module", async () => {
    const { student, course } = await setupCourse({ lessons: 1 });
    const hiddenModule = await Module.create({
      course: course._id,
      title: "Hidden Module",
      order: 2,
      isPublished: false,
    });
    await createRequiredQuiz(course._id, hiddenModule._id);

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.body.data.progress.totalRequiredQuizzes).toBe(0);
    expect(res.body.data.progress.totalRequiredItems).toBe(1);
  });

  it("completes the course only when lessons and required quizzes are both done", async () => {
    const { student, course, module, lessons } = await setupCourse({ lessons: 1 });
    const quiz = await createRequiredQuiz(course._id, module._id);

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const beforeQuiz = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));
    expect(beforeQuiz.body.data.progress.isCompleted).toBe(false);
    expect(beforeQuiz.body.data.progress.progressPercentage).toBe(50);

    await request(app)
      .post(`/api/quizzes/${quiz._id.toString()}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: quiz.questions[0]._id.toString(), selectedAnswer: "true" },
        ],
      });

    const afterQuiz = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));
    expect(afterQuiz.body.data.progress).toMatchObject({
      passedRequiredQuizzes: 1,
      progressPercentage: 100,
      isCompleted: true,
    });
  });

  it("treats an empty course as not complete", async () => {
    const { student, course } = await setupCourse({ lessons: 0 });

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.body.data.progress).toMatchObject({
      totalRequiredItems: 0,
      progressPercentage: 0,
      isCompleted: false,
    });
  });

  it("requires an active enrollment", async () => {
    const { student, course } = await setupCourse({ lessons: 1, enroll: false });

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(student.token));

    expect(res.status).toBe(403);
  });
});

describe("GET /api/progress/my-courses", () => {
  it("returns per-course progress with a dashboard summary", async () => {
    const { student, course, lessons } = await setupCourse({ lessons: 2 });

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const res = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.courses).toHaveLength(1);
    expect(res.body.data.courses[0].course.title).toBe(course.title);
    expect(res.body.data.courses[0].progress.progressPercentage).toBe(50);
    expect(res.body.data.summary).toMatchObject({
      activeCourses: 1,
      completedCourses: 0,
      overallProgressPercentage: 50,
      averageQuizScore: null,
      quizzesAttempted: 0,
    });
  });

  it("averages the best attempt per quiz", async () => {
    const { student, course, module } = await setupCourse({ lessons: 1 });
    const quiz = await createRequiredQuiz(course._id, module._id);
    const questionId = quiz.questions[0]._id.toString();
    const url = `/api/quizzes/${quiz._id.toString()}/submit`;

    // A failed attempt followed by a passing one — the best counts.
    await request(app)
      .post(url)
      .set(auth(student.token))
      .send({ answers: [{ questionId, selectedAnswer: "false" }] });
    await request(app)
      .post(url)
      .set(auth(student.token))
      .send({ answers: [{ questionId, selectedAnswer: "true" }] });

    const res = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(student.token));

    expect(res.body.data.summary.averageQuizScore).toBe(100);
    expect(res.body.data.summary.quizzesAttempted).toBe(1);
  });

  it("omits cancelled enrollments and is student-only", async () => {
    const { student, course } = await setupCourse({ lessons: 1 });
    await Enrollment.updateOne(
      { student: student.user._id, course: course._id },
      { status: EnrollmentStatus.CANCELLED }
    );

    const res = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(student.token));
    expect(res.body.data.courses).toHaveLength(0);

    const admin = await createUser(UserRole.ADMIN);
    const asAdmin = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(admin.token));
    expect(asAdmin.status).toBe(403);
  });

  it("counts a fully finished course as completed", async () => {
    const { student, lessons } = await setupCourse({ lessons: 1 });

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(student.token));

    const res = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(student.token));

    expect(res.body.data.summary).toMatchObject({
      completedCourses: 1,
      overallProgressPercentage: 100,
    });
  });
});

describe("progress and attempt records stay per student", () => {
  it("one student's completion never affects another's progress", async () => {
    const { course, lessons } = await setupCourse({ lessons: 2 });
    const first = await createUser(UserRole.STUDENT);
    const second = await createUser(UserRole.STUDENT);
    for (const student of [first, second]) {
      await Enrollment.create({
        student: student.user._id,
        course: course._id,
        status: EnrollmentStatus.ACTIVE,
      });
    }

    await request(app)
      .post(`/api/lessons/${lessons[0]._id.toString()}/complete`)
      .set(auth(first.token));

    const firstProgress = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(first.token));
    const secondProgress = await request(app)
      .get(`/api/courses/${course._id.toString()}/progress`)
      .set(auth(second.token));

    expect(firstProgress.body.data.progress.completedLessons).toBe(1);
    expect(secondProgress.body.data.progress.completedLessons).toBe(0);
    expect(await QuizAttempt.countDocuments()).toBe(0);
  });
});
