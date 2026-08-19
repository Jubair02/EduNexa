import { inflateSync } from "node:zlib";
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Certificate, CertificateStatus } from "../src/models/certificate.model";
import { Course, CourseDocument, CourseStatus } from "../src/models/course.model";
import { Enrollment, EnrollmentStatus } from "../src/models/enrollment.model";
import { Lesson, LessonDocument, LessonType } from "../src/models/lesson.model";
import { Module, ModuleDocument } from "../src/models/module.model";
import { QuestionType, Quiz, QuizDocument } from "../src/models/quiz.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUser = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Cert",
    lastName: `${role}${counter}`,
    email: `cert-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Reads the text drawn in a pdfkit document: inflate the content streams, then
 * decode the hex strings inside the TJ operators. Lets the tests assert what a
 * reader would actually see on the page.
 */
const extractPdfText = (pdf: Buffer): string => {
  let raw = "";
  let index = 0;

  while (index < pdf.length) {
    const start = pdf.indexOf("stream", index);
    if (start === -1) break;
    const end = pdf.indexOf("endstream", start);
    if (end === -1) break;

    let from = start + "stream".length;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    const chunk = pdf.subarray(from, end);
    try {
      raw += `${inflateSync(chunk).toString("latin1")}\n`;
    } catch {
      raw += `${chunk.toString("latin1")}\n`;
    }
    index = end + 1;
  }

  return [...raw.matchAll(/\[((?:\s*<[0-9a-fA-F]*>\s*-?[\d.]*)+)\]\s*TJ/g)]
    .map(([, group]) =>
      [...group.matchAll(/<([0-9a-fA-F]*)>/g)]
        .map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"))
        .join("")
    )
    .join("\n");
};

interface Fixture {
  instructor: Awaited<ReturnType<typeof createUser>>;
  student: Awaited<ReturnType<typeof createUser>>;
  course: CourseDocument;
  module: ModuleDocument;
  lessons: LessonDocument[];
  requiredQuiz: QuizDocument | null;
  optionalQuiz: QuizDocument | null;
}

const makeQuiz = async (
  courseId: unknown,
  moduleId: unknown,
  isRequired: boolean
): Promise<QuizDocument> =>
  Quiz.create({
    course: courseId,
    module: moduleId,
    title: `${isRequired ? "Required" : "Optional"} Quiz ${++counter}`,
    passingScore: 70,
    isRequired,
    isPublished: true,
    questions: [
      {
        questionText: "Is this correct?",
        type: QuestionType.TRUE_FALSE,
        options: ["true", "false"],
        correctAnswer: "true",
        points: 10,
        order: 1,
      },
    ],
  });

/** Published course with published content and an active student enrollment. */
const setupCourse = async ({
  lessons = 1,
  requiredQuiz = false,
  optionalQuiz = false,
  enroll = true,
}: {
  lessons?: number;
  requiredQuiz?: boolean;
  optionalQuiz?: boolean;
  enroll?: boolean;
} = {}): Promise<Fixture> => {
  const instructor = await createUser(UserRole.INSTRUCTOR);
  const student = await createUser(UserRole.STUDENT);

  counter += 1;
  const course = await Course.create({
    title: `Certifiable Course ${counter}`,
    slug: `certifiable-course-${counter}`,
    description: "A course used by certificate tests.",
    category: "programming",
    level: "beginner",
    instructor: instructor.user._id,
    status: CourseStatus.PUBLISHED,
  });
  const module = await Module.create({
    course: course._id,
    title: "Certifiable Module",
    order: 1,
    isPublished: true,
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

  return {
    instructor,
    student,
    course,
    module,
    lessons: created,
    requiredQuiz: requiredQuiz ? await makeQuiz(course._id, module._id, true) : null,
    optionalQuiz: optionalQuiz ? await makeQuiz(course._id, module._id, false) : null,
  };
};

const completeLessons = async (fixture: Fixture): Promise<void> => {
  for (const lesson of fixture.lessons) {
    await request(app)
      .post(`/api/lessons/${lesson._id.toString()}/complete`)
      .set(auth(fixture.student.token));
  }
};

const passQuiz = async (
  quiz: QuizDocument,
  token: string,
  answer = "true"
): Promise<request.Response> =>
  request(app)
    .post(`/api/quizzes/${quiz._id.toString()}/submit`)
    .set(auth(token))
    .send({
      answers: [{ questionId: quiz.questions[0]._id.toString(), selectedAnswer: answer }],
    });

/** Finishes every requirement and returns the final response body. */
const finishCourse = async (fixture: Fixture) => {
  await completeLessons(fixture);
  if (fixture.requiredQuiz) {
    return (await passQuiz(fixture.requiredQuiz, fixture.student.token)).body;
  }
  return (
    await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/progress`)
      .set(auth(fixture.student.token))
  ).body;
};

describe("course completion", () => {
  it("completes the course after the final lesson and issues a certificate", async () => {
    const fixture = await setupCourse({ lessons: 2 });

    const first = await request(app)
      .post(`/api/lessons/${fixture.lessons[0]._id.toString()}/complete`)
      .set(auth(fixture.student.token));
    expect(first.body.data.courseProgress.isCompleted).toBe(false);
    expect(first.body.data.courseProgress.certificateAvailable).toBe(false);
    expect(first.body.data.certificate).toBeNull();
    expect(first.body.data.newlyCompleted).toBe(false);

    const last = await request(app)
      .post(`/api/lessons/${fixture.lessons[1]._id.toString()}/complete`)
      .set(auth(fixture.student.token));
    expect(last.body.data.courseProgress).toMatchObject({
      progressPercentage: 100,
      isCompleted: true,
      certificateAvailable: true,
    });
    expect(last.body.data.courseProgress.completedAt).toBeDefined();
    expect(last.body.data.newlyCompleted).toBe(true);
    expect(last.body.data.certificate.certificateNumber).toMatch(/^LMS-\d{4}-\d{6}$/);

    const enrollment = await Enrollment.findOne({ student: fixture.student.user._id });
    expect(enrollment?.status).toBe(EnrollmentStatus.COMPLETED);
    expect(enrollment?.completedAt).toBeDefined();
  });

  it("completes only after the final required quiz is passed", async () => {
    const fixture = await setupCourse({ lessons: 1, requiredQuiz: true });
    await completeLessons(fixture);

    const failed = await passQuiz(fixture.requiredQuiz!, fixture.student.token, "false");
    expect(failed.body.data.courseProgress.isCompleted).toBe(false);
    expect(failed.body.data.certificate).toBeNull();
    expect(await Certificate.countDocuments()).toBe(0);

    const passed = await passQuiz(fixture.requiredQuiz!, fixture.student.token);
    expect(passed.body.data.courseProgress.isCompleted).toBe(true);
    expect(passed.body.data.newlyCompleted).toBe(true);
    expect(await Certificate.countDocuments()).toBe(1);
  });

  it("does not require optional quizzes for completion", async () => {
    const fixture = await setupCourse({ lessons: 1, optionalQuiz: true });

    const body = await finishCourse(fixture);

    expect(body.data.progress ?? body.data.courseProgress).toMatchObject({
      isCompleted: true,
      certificateAvailable: true,
    });
    expect(await Certificate.countDocuments()).toBe(1);
  });

  it("never completes a cancelled enrollment", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await completeLessons(fixture);
    await Certificate.deleteMany({});
    await Enrollment.updateOne(
      { student: fixture.student.user._id },
      { status: EnrollmentStatus.CANCELLED, $unset: { completedAt: 1 } }
    );

    const res = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/progress`)
      .set(auth(fixture.student.token));

    expect(res.status).toBe(403);
    const enrollment = await Enrollment.findOne({ student: fixture.student.user._id });
    expect(enrollment?.status).toBe(EnrollmentStatus.CANCELLED);
  });

  it("keeps the completion date stable across repeated requests", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    const first = await finishCourse(fixture);
    const firstDate = (first.data.progress ?? first.data.courseProgress).completedAt;

    // Repeat the same requests several times.
    await completeLessons(fixture);
    const again = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/progress`)
      .set(auth(fixture.student.token));

    expect(again.body.data.progress.completedAt).toBe(firstDate);
    expect(await Certificate.countDocuments()).toBe(1);
  });

  it("issues exactly one certificate however often completion is re-checked", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);

    await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app)
          .get(`/api/courses/${fixture.course._id.toString()}/progress`)
          .set(auth(fixture.student.token))
      )
    );

    expect(await Certificate.countDocuments({ student: fixture.student.user._id })).toBe(1);
  });

  it("lets a completed student keep access to the course, quizzes and progress", async () => {
    const fixture = await setupCourse({ lessons: 1, optionalQuiz: true });
    await finishCourse(fixture);

    const lesson = await request(app)
      .get(`/api/lessons/${fixture.lessons[0]._id.toString()}`)
      .set(auth(fixture.student.token));
    const quizzes = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/quizzes`)
      .set(auth(fixture.student.token));
    const progress = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/progress`)
      .set(auth(fixture.student.token));
    const stillEnrolled = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/enrollment`)
      .set(auth(fixture.student.token));

    expect(lesson.status).toBe(200);
    expect(quizzes.status).toBe(200);
    expect(progress.status).toBe(200);
    expect(stillEnrolled.body.data.isEnrolled).toBe(true);
    expect(stillEnrolled.body.data.status).toBe("completed");
  });

  it("reports completion in the student's course list", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);

    const res = await request(app)
      .get("/api/progress/my-courses")
      .set(auth(fixture.student.token));

    expect(res.body.data.summary.completedCourses).toBe(1);
    expect(res.body.data.courses[0].enrollmentStatus).toBe("completed");
    expect(res.body.data.courses[0].progress.certificateAvailable).toBe(true);
  });
});

describe("certificate contents", () => {
  it("snapshots the student, course and instructor names", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);

    const certificate = await Certificate.findOne({ student: fixture.student.user._id });
    expect(certificate?.studentName).toBe(
      `${fixture.student.user.firstName} ${fixture.student.user.lastName}`
    );
    expect(certificate?.courseTitle).toBe(fixture.course.title);
    expect(certificate?.instructorName).toBe(
      `${fixture.instructor.user.firstName} ${fixture.instructor.user.lastName}`
    );
    expect(certificate?.verificationCode).toMatch(/^[A-Z2-9]{16}$/);
    expect(certificate?.status).toBe(CertificateStatus.ACTIVE);

    // Renaming afterwards must not rewrite history.
    await User.updateOne({ _id: fixture.student.user._id }, { firstName: "Renamed" });
    await Course.updateOne({ _id: fixture.course._id }, { title: "Retitled Course" });

    const unchanged = await Certificate.findById(certificate!._id);
    expect(unchanged?.studentName).toBe(certificate?.studentName);
    expect(unchanged?.courseTitle).toBe(fixture.course.title);
  });

  it("numbers certificates sequentially within the year", async () => {
    const first = await setupCourse({ lessons: 1 });
    await finishCourse(first);
    const second = await setupCourse({ lessons: 1 });
    await finishCourse(second);

    const numbers = (await Certificate.find().sort({ certificateNumber: 1 })).map(
      (certificate) => certificate.certificateNumber
    );
    const year = new Date().getFullYear();
    expect(numbers).toEqual([`LMS-${year}-000001`, `LMS-${year}-000002`]);
  });

  it("keeps certificate numbers and verification codes unique", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const existing = await Certificate.findOne({});

    await expect(
      Certificate.create({
        certificateNumber: existing!.certificateNumber,
        verificationCode: "ZZZZZZZZZZZZZZZZ",
        student: fixture.instructor.user._id,
        course: fixture.course._id,
        enrollment: existing!.enrollment,
        completionDate: new Date(),
        studentName: "Dup",
        courseTitle: "Dup",
        instructorName: "Dup",
      })
    ).rejects.toThrow();

    await expect(
      Certificate.create({
        certificateNumber: "LMS-1999-000001",
        verificationCode: existing!.verificationCode,
        student: fixture.instructor.user._id,
        course: fixture.course._id,
        enrollment: existing!.enrollment,
        completionDate: new Date(),
        studentName: "Dup",
        courseTitle: "Dup",
        instructorName: "Dup",
      })
    ).rejects.toThrow();
  });

  it("allows only one certificate per student and course", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const existing = await Certificate.findOne({});

    await expect(
      Certificate.create({
        certificateNumber: "LMS-1999-000002",
        verificationCode: "YYYYYYYYYYYYYYYY",
        student: existing!.student,
        course: existing!.course,
        enrollment: existing!.enrollment,
        completionDate: new Date(),
        studentName: "Dup",
        courseTitle: "Dup",
        instructorName: "Dup",
      })
    ).rejects.toThrow();
  });
});

describe("GET /api/certificates", () => {
  it("returns only the authenticated student's certificates", async () => {
    const mine = await setupCourse({ lessons: 1 });
    await finishCourse(mine);
    const theirs = await setupCourse({ lessons: 1 });
    await finishCourse(theirs);

    const res = await request(app)
      .get("/api/certificates")
      .set(auth(mine.student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].courseTitle).toBe(mine.course.title);
    expect(res.body.pagination.total).toBe(1);
  });

  it("ignores a student filter supplied by a student", async () => {
    const mine = await setupCourse({ lessons: 1 });
    await finishCourse(mine);
    const theirs = await setupCourse({ lessons: 1 });
    await finishCourse(theirs);

    const res = await request(app)
      .get(`/api/certificates?student=${theirs.student.user._id.toString()}`)
      .set(auth(mine.student.token));

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].studentName).toBe(
      `${mine.student.user.firstName} ${mine.student.user.lastName}`
    );
  });

  it("lets an admin list everything with filters, search and pagination", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const first = await setupCourse({ lessons: 1 });
    await finishCourse(first);
    const second = await setupCourse({ lessons: 1 });
    await finishCourse(second);

    const all = await request(app).get("/api/certificates").set(auth(admin.token));
    expect(all.body.data).toHaveLength(2);

    const byCourse = await request(app)
      .get(`/api/certificates?course=${first.course._id.toString()}`)
      .set(auth(admin.token));
    expect(byCourse.body.data).toHaveLength(1);

    const byStudent = await request(app)
      .get(`/api/certificates?student=${second.student.user._id.toString()}`)
      .set(auth(admin.token));
    expect(byStudent.body.data).toHaveLength(1);

    const bySearch = await request(app)
      .get(`/api/certificates?search=${encodeURIComponent(first.course.title)}`)
      .set(auth(admin.token));
    expect(bySearch.body.data).toHaveLength(1);

    const paged = await request(app)
      .get("/api/certificates?limit=1&page=2")
      .set(auth(admin.token));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination.total).toBe(2);
  });

  it("rejects instructors and anonymous callers", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);

    const asInstructor = await request(app)
      .get("/api/certificates")
      .set(auth(fixture.instructor.token));
    const anonymous = await request(app).get("/api/certificates");

    expect(asInstructor.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it("offers no way for a student to create a certificate", async () => {
    const fixture = await setupCourse({ lessons: 1 });

    const res = await request(app)
      .post("/api/certificates")
      .set(auth(fixture.student.token))
      .send({ course: fixture.course._id.toString(), studentName: "Forged" });

    expect(res.status).toBe(404);
    expect(await Certificate.countDocuments()).toBe(0);
  });
});

describe("GET /api/certificates/:id", () => {
  it("shows the owner every printed field", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}`)
      .set(auth(fixture.student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.certificate).toMatchObject({
      certificateNumber: certificate!.certificateNumber,
      verificationCode: certificate!.verificationCode,
      studentName: certificate!.studentName,
      courseTitle: certificate!.courseTitle,
      instructorName: certificate!.instructorName,
      status: "active",
    });
    expect(res.body.data.certificate.completionDate).toBeDefined();
    expect(res.body.data.certificate.issuedAt).toBeDefined();
  });

  it("lets an admin read any certificate", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}`)
      .set(auth(admin.token));

    expect(res.status).toBe(200);
  });

  it("hides a certificate from other students and from instructors", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const stranger = await createUser(UserRole.STUDENT);
    const certificate = await Certificate.findOne({});
    const url = `/api/certificates/${certificate!._id.toString()}`;

    expect((await request(app).get(url).set(auth(stranger.token))).status).toBe(404);
    // Even the instructor of the course cannot open a student's certificate.
    expect((await request(app).get(url).set(auth(fixture.instructor.token))).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it("rejects invalid and unknown ids", async () => {
    const fixture = await setupCourse({ lessons: 1 });

    const invalid = await request(app)
      .get("/api/certificates/not-an-id")
      .set(auth(fixture.student.token));
    const missing = await request(app)
      .get("/api/certificates/64b2fa8a0f1b2c3d4e5f6a7b")
      .set(auth(fixture.student.token));

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("GET /api/certificates/:id/download", () => {
  it("streams a PDF to the owner", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}/download`)
      .set(auth(fixture.student.token))
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain(
      `${certificate!.certificateNumber}.pdf`
    );
    expect(res.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it("prints every required field on the certificate", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}/download`)
      .set(auth(fixture.student.token))
      .responseType("blob");

    const text = extractPdfText(res.body as Buffer);
    for (const expected of [
      "EduNexa",
      "Certificate of Completion",
      "This certificate is proudly presented to",
      certificate!.studentName,
      "for successfully completing",
      certificate!.courseTitle,
      certificate!.instructorName,
      certificate!.certificateNumber,
      certificate!.verificationCode,
      `/verify/certificate/${certificate!.verificationCode}`,
    ]) {
      expect(text).toContain(expected);
    }
    // Dates are printed in a long, human-readable form.
    expect(text).toMatch(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
  });

  it("marks a revoked certificate on the printed page", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});
    await request(app)
      .patch(`/api/certificates/${certificate!._id.toString()}/status`)
      .set(auth(admin.token))
      .send({ status: "revoked" });

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}/download`)
      .set(auth(fixture.student.token))
      .responseType("blob");

    expect(extractPdfText(res.body as Buffer)).toContain(
      "THIS CERTIFICATE HAS BEEN REVOKED"
    );
  });

  it("enforces ownership on download", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const stranger = await createUser(UserRole.STUDENT);
    const certificate = await Certificate.findOne({});
    const url = `/api/certificates/${certificate!._id.toString()}/download`;

    expect((await request(app).get(url).set(auth(stranger.token))).status).toBe(404);
    expect((await request(app).get(url).set(auth(fixture.instructor.token))).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it("lets an admin download any certificate", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}/download`)
      .set(auth(admin.token))
      .responseType("blob");

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("GET /api/certificates/verify/:verificationCode", () => {
  it("verifies without authentication and returns only certificate-face data", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app).get(
      `/api/certificates/verify/${certificate!.verificationCode}`
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      valid: true,
      certificateNumber: certificate!.certificateNumber,
      studentName: certificate!.studentName,
      courseTitle: certificate!.courseTitle,
      instructorName: certificate!.instructorName,
      completionDate: certificate!.completionDate.toISOString(),
      issuedAt: certificate!.issuedAt.toISOString(),
      status: "active",
    });

    // No private data may appear anywhere in the payload.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(fixture.student.user.email);
    expect(body).not.toContain(fixture.student.user._id.toString());
    expect(body).not.toContain(certificate!._id.toString());
    expect(body).not.toContain(certificate!.enrollment.toString());
    expect(body).not.toContain("verificationCode");
  });

  it("also accepts the printed certificate number", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    const res = await request(app).get(
      `/api/certificates/verify/${certificate!.certificateNumber}`
    );

    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.certificateNumber).toBe(certificate!.certificateNumber);
  });

  it("reports unknown codes as invalid without leaking anything", async () => {
    const res = await request(app).get("/api/certificates/verify/NOSUCHCODE123456");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ valid: false });
  });
});

describe("PATCH /api/certificates/:id/status", () => {
  it("lets an admin revoke and restore without deleting the record", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});
    const url = `/api/certificates/${certificate!._id.toString()}/status`;

    const revoked = await request(app)
      .patch(url)
      .set(auth(admin.token))
      .send({ status: "revoked" });
    expect(revoked.status).toBe(200);
    expect(revoked.body.message).toBe("Certificate revoked");
    expect(await Certificate.countDocuments()).toBe(1);

    // Verification now fails, while still reporting the revoked state.
    const verify = await request(app).get(
      `/api/certificates/verify/${certificate!.verificationCode}`
    );
    expect(verify.body.data.valid).toBe(false);
    expect(verify.body.data.status).toBe("revoked");

    // The owner keeps access to it.
    const owner = await request(app)
      .get(`/api/certificates/${certificate!._id.toString()}`)
      .set(auth(fixture.student.token));
    expect(owner.status).toBe(200);
    expect(owner.body.data.certificate.status).toBe("revoked");

    const restored = await request(app)
      .patch(url)
      .set(auth(admin.token))
      .send({ status: "active" });
    expect(restored.body.message).toBe("Certificate restored");
    expect(
      (await request(app).get(`/api/certificates/verify/${certificate!.verificationCode}`))
        .body.data.valid
    ).toBe(true);
  });

  it("rejects a no-op transition and invalid statuses", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});
    const url = `/api/certificates/${certificate!._id.toString()}/status`;

    const noop = await request(app)
      .patch(url)
      .set(auth(admin.token))
      .send({ status: "active" });
    const invalid = await request(app)
      .patch(url)
      .set(auth(admin.token))
      .send({ status: "deleted" });

    expect(noop.status).toBe(400);
    expect(invalid.status).toBe(400);
  });

  it("only admins may change certificate status", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});
    const url = `/api/certificates/${certificate!._id.toString()}/status`;

    const asStudent = await request(app)
      .patch(url)
      .set(auth(fixture.student.token))
      .send({ status: "revoked" });
    const asInstructor = await request(app)
      .patch(url)
      .set(auth(fixture.instructor.token))
      .send({ status: "revoked" });

    expect(asStudent.status).toBe(403);
    expect(asInstructor.status).toBe(403);
    expect((await Certificate.findById(certificate!._id))?.status).toBe("active");
  });

  it("ignores certificate fields a client tries to overwrite", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const certificate = await Certificate.findOne({});

    await request(app)
      .patch(`/api/certificates/${certificate!._id.toString()}/status`)
      .set(auth(admin.token))
      .send({
        status: "revoked",
        certificateNumber: "LMS-1900-000001",
        studentName: "Forged Name",
        courseTitle: "Forged Course",
        verificationCode: "FORGEDFORGEDFORG",
      });

    const stored = await Certificate.findById(certificate!._id);
    expect(stored?.certificateNumber).toBe(certificate!.certificateNumber);
    expect(stored?.studentName).toBe(certificate!.studentName);
    expect(stored?.courseTitle).toBe(certificate!.courseTitle);
    expect(stored?.verificationCode).toBe(certificate!.verificationCode);
  });
});

describe("GET /api/courses/:courseId/completion-statistics", () => {
  it("reports completions and certificates to the owning instructor", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);

    // A second student enrolls but does not finish.
    const other = await createUser(UserRole.STUDENT);
    await Enrollment.create({
      student: other.user._id,
      course: fixture.course._id,
      status: EnrollmentStatus.ACTIVE,
    });

    const res = await request(app)
      .get(`/api/courses/${fixture.course._id.toString()}/completion-statistics`)
      .set(auth(fixture.instructor.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      enrolledStudents: 2,
      activeStudents: 1,
      completedStudents: 1,
      certificatesIssued: 1,
      activeCertificates: 1,
      revokedCertificates: 0,
      completionRate: 50,
    });
  });

  it("is limited to the course owner and admins", async () => {
    const fixture = await setupCourse({ lessons: 1 });
    await finishCourse(fixture);
    const admin = await createUser(UserRole.ADMIN);
    const otherInstructor = await createUser(UserRole.INSTRUCTOR);
    const url = `/api/courses/${fixture.course._id.toString()}/completion-statistics`;

    expect((await request(app).get(url).set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get(url).set(auth(otherInstructor.token))).status).toBe(403);
    expect((await request(app).get(url).set(auth(fixture.student.token))).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
  });
});
