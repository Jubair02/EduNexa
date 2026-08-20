/**
 * Pagination on the two lists a student sees of their own work. The point of
 * paging these is not the UI: computing progress for every enrolled course was
 * a query per course, so the summary is now aggregated whole-account while only
 * a page's worth of rows is worked out in detail.
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

const quizBody = {
  title: "Paged Check",
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
    {
      questionText: "TypeScript is a superset of JavaScript.",
      type: "true-false",
      correctAnswer: "true",
      points: 10,
    },
  ],
};

const createPublishedQuiz = async (
  courseId: string,
  token: string,
  overrides: Record<string, unknown> = {}
) => {
  const created = await request(app)
    .post(`/api/courses/${courseId}/quizzes`)
    .set(auth(token))
    .send({ ...quizBody, ...overrides });
  const quiz = created.body.data.quiz as { id: string; questions: { id: string }[] };
  await request(app)
    .patch(`/api/quizzes/${quiz.id}/status`)
    .set(auth(token))
    .send({ isPublished: true });
  return quiz;
};

describe("pagination on the student's own lists", () => {
  /** Builds `count` published one-lesson courses and enrols the student in all. */
  const enrolInMany = async (count: number) => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const lessons = [];
    for (let index = 0; index < count; index += 1) {
      const built = await buildCourse(instructor.user._id.toString(), 1);
      await Enrollment.create({
        student: student.user._id,
        course: built.course._id,
        status: EnrollmentStatus.ACTIVE,
      });
      lessons.push(built.lessons[0]);
    }
    return { instructor, student, lessons };
  };

  it("pages the course rows while the summary still covers every course", async () => {
    const { student, lessons } = await enrolInMany(5);
    // Finish two of the five courses outright.
    for (const lesson of lessons.slice(0, 2)) {
      await request(app)
        .post(`/api/lessons/${lesson._id.toString()}/complete`)
        .set(auth(student.token));
    }

    const firstPage = await request(app)
      .get("/api/progress/my-courses?page=1&limit=2")
      .set(auth(student.token));

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.courses).toHaveLength(2);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });

    // The summary describes all five courses, not just the two on this page.
    expect(firstPage.body.data.summary).toMatchObject({
      activeCourses: 3,
      completedCourses: 2,
      overallProgressPercentage: 40,
    });

    const lastPage = await request(app)
      .get("/api/progress/my-courses?page=3&limit=2")
      .set(auth(student.token));
    expect(lastPage.body.data.courses).toHaveLength(1);
    // Same summary, whichever page is asked for.
    expect(lastPage.body.data.summary).toMatchObject({
      completedCourses: 2,
      overallProgressPercentage: 40,
    });
  });

  it("returns every course when no page is asked for", async () => {
    const { student } = await enrolInMany(3);

    const res = await request(app).get("/api/progress/my-courses").set(auth(student.token));

    expect(res.body.data.courses).toHaveLength(3);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 3 });
  });

  it("rejects unsafe page sizes on both lists", async () => {
    const { student } = await enrolInMany(1);

    for (const path of ["/api/progress/my-courses", "/api/quizzes/my-quizzes"]) {
      for (const qs of ["?page=0", "?limit=0", "?limit=1000", "?limit=abc"]) {
        const res = await request(app).get(`${path}${qs}`).set(auth(student.token));
        expect(res.status, `${path}${qs}`).toBe(400);
      }
    }
  });

  it("pages the quiz list and keeps attempt figures on the right rows", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { course } = await buildCourse(instructor.user._id.toString(), 1);
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });

    const created = [];
    for (let index = 1; index <= 3; index += 1) {
      created.push(
        await createPublishedQuiz(course._id.toString(), instructor.token, {
          title: `Paged Quiz ${index}`,
        })
      );
    }

    // Pass the first quiz only.
    await request(app)
      .post(`/api/quizzes/${created[0].id}/submit`)
      .set(auth(student.token))
      .send({
        answers: [
          { questionId: created[0].questions[0].id, selectedAnswer: "Alpha" },
          { questionId: created[0].questions[1].id, selectedAnswer: "true" },
        ],
      });

    const page = await request(app)
      .get("/api/quizzes/my-quizzes?page=1&limit=2")
      .set(auth(student.token));

    expect(page.body.data).toHaveLength(2);
    expect(page.body.pagination).toMatchObject({ total: 3, totalPages: 2 });
    // The attempt belongs to the quiz that was taken, not to whichever row is first.
    const attempted = page.body.data.find(
      (quiz: { title: string }) => quiz.title === "Paged Quiz 1"
    );
    expect(attempted).toMatchObject({ attemptCount: 1, bestPercentage: 100, passed: true });
    const untouched = page.body.data.find(
      (quiz: { title: string }) => quiz.title === "Paged Quiz 2"
    );
    expect(untouched).toMatchObject({ attemptCount: 0, bestPercentage: null });

    const second = await request(app)
      .get("/api/quizzes/my-quizzes?page=2&limit=2")
      .set(auth(student.token));
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].title).toBe("Paged Quiz 3");
  });
});
