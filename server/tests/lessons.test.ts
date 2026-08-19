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
    firstName: "Les",
    lastName: role,
    email: `les-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

/** Owner + published course + published module, the common fixture. */
const createContentFixture = async (overrides: {
  courseStatus?: CourseStatus;
  modulePublished?: boolean;
} = {}) => {
  const owner = await createUserWithToken(UserRole.INSTRUCTOR);
  const course = await Course.create({
    title: "Lesson Host Course",
    slug: `lesson-host-${++counter}`,
    description: "A course that hosts lessons for tests.",
    category: "programming",
    level: "beginner",
    instructor: owner.user._id,
    status: overrides.courseStatus ?? CourseStatus.PUBLISHED,
  });
  const module = await Module.create({
    course: course._id,
    title: "Host Module",
    order: 1,
    isPublished: overrides.modulePublished ?? true,
  });
  return { owner, course, module };
};

const createLessonInDb = async (
  courseId: unknown,
  moduleId: unknown,
  overrides: Record<string, unknown> = {}
) =>
  Lesson.create({
    module: moduleId,
    course: courseId,
    title: `Lesson ${++counter}`,
    type: LessonType.TEXT,
    content: "Default lesson body content.",
    order: (overrides.order as number) ?? 1,
    ...overrides,
  });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("POST /api/modules/:moduleId/lessons", () => {
  it("creates each lesson type with sequential orders", async () => {
    const { owner, module } = await createContentFixture();
    const url = `/api/modules/${module._id.toString()}/lessons`;

    const video = await request(app).post(url).set(auth(owner.token)).send({
      title: "Video Lesson",
      type: "video",
      videoUrl: "https://www.youtube.com/watch?v=abc123",
      duration: 12,
    });
    const text = await request(app).post(url).set(auth(owner.token)).send({
      title: "Text Lesson",
      type: "text",
      content: "Written lesson body.",
    });
    const pdf = await request(app).post(url).set(auth(owner.token)).send({
      title: "PDF Lesson",
      type: "pdf",
      fileUrl: "https://files.example.com/lesson.pdf",
      fileName: "lesson.pdf",
    });
    const doc = await request(app).post(url).set(auth(owner.token)).send({
      title: "Document Lesson",
      type: "document",
      fileUrl: "https://files.example.com/notes.docx",
      fileName: "notes.docx",
    });

    expect(video.status).toBe(201);
    expect(video.body.data.lesson.order).toBe(1);
    expect(video.body.data.lesson.isPublished).toBe(false);
    expect(video.body.data.lesson.isPreview).toBe(false);
    expect(text.body.data.lesson.order).toBe(2);
    expect(pdf.body.data.lesson.order).toBe(3);
    expect(doc.body.data.lesson.order).toBe(4);
    // The course is derived from the module server-side.
    expect(video.body.data.lesson.course).toBe(
      (await Module.findById(module._id))?.course.toString()
    );
  });

  it.each([
    ["video without videoUrl", { title: "Bad Video", type: "video" }],
    ["text without content", { title: "Bad Text", type: "text" }],
    ["pdf without fileUrl", { title: "Bad PDF", type: "pdf" }],
    ["document without fileUrl", { title: "Bad Doc", type: "document" }],
    ["invalid type", { title: "Bad Type", type: "podcast", content: "x" }],
    [
      "invalid video url",
      { title: "Bad URL", type: "video", videoUrl: "not-a-url" },
    ],
  ])("rejects invalid combination: %s", async (_label, body) => {
    const { owner, module } = await createContentFixture();

    const res = await request(app)
      .post(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(owner.token))
      .send(body);

    expect(res.status).toBe(400);
  });

  it("blocks other instructors and students", async () => {
    const { module } = await createContentFixture();
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const body = { title: "Blocked Lesson", type: "text", content: "Body." };

    const asOther = await request(app)
      .post(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(other.token))
      .send(body);
    const asStudent = await request(app)
      .post(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(student.token))
      .send(body);

    expect(asOther.status).toBe(403);
    expect(asStudent.status).toBe(403);
  });

  it("rejects an invalid or missing module", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const body = { title: "Orphan Lesson", type: "text", content: "Body." };

    const invalid = await request(app)
      .post("/api/modules/not-an-id/lessons")
      .set(auth(admin.token))
      .send(body);
    const missing = await request(app)
      .post("/api/modules/64b2fa8a0f1b2c3d4e5f6a7b/lessons")
      .set(auth(admin.token))
      .send(body);

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("GET /api/modules/:moduleId/lessons", () => {
  it("returns all lessons in order for the owner, published only for students", async () => {
    const { owner, course, module } = await createContentFixture();
    const student = await createUserWithToken(UserRole.STUDENT);
    await createLessonInDb(course._id, module._id, { order: 1, isPublished: true });
    await createLessonInDb(course._id, module._id, { order: 2, isPublished: false });

    const asOwner = await request(app)
      .get(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(owner.token));
    const asStudent = await request(app)
      .get(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(student.token));

    expect(asOwner.body.data).toHaveLength(2);
    expect(asOwner.body.data[0].order).toBe(1);
    expect(asStudent.body.data).toHaveLength(1);
    expect(asStudent.body.data[0].isPublished).toBe(true);
  });

  it("hides lessons of unpublished modules from students", async () => {
    const { course, module } = await createContentFixture({ modulePublished: false });
    const student = await createUserWithToken(UserRole.STUDENT);
    await createLessonInDb(course._id, module._id, { order: 1, isPublished: true });

    const res = await request(app)
      .get(`/api/modules/${module._id.toString()}/lessons`)
      .set(auth(student.token));

    expect(res.status).toBe(404);
  });
});

describe("GET /api/lessons/:id", () => {
  it("returns the lesson with context and prev/next navigation", async () => {
    const { owner, course, module } = await createContentFixture();
    const module2 = await Module.create({
      course: course._id,
      title: "Second Module",
      order: 2,
      isPublished: true,
    });
    const l1 = await createLessonInDb(course._id, module._id, { order: 1, isPublished: true });
    const l2 = await createLessonInDb(course._id, module._id, { order: 2, isPublished: true });
    const l3 = await createLessonInDb(course._id, module2._id, { order: 1, isPublished: true });

    const res = await request(app)
      .get(`/api/lessons/${l2._id.toString()}`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.id).toBe(l2._id.toString());
    expect(res.body.data.context.moduleTitle).toBe("Host Module");
    expect(res.body.data.context.previousLessonId).toBe(l1._id.toString());
    // Next crosses the module boundary in course order.
    expect(res.body.data.context.nextLessonId).toBe(l3._id.toString());
  });

  it("skips unpublished lessons in an enrolled student's prev/next navigation", async () => {
    const { course, module } = await createContentFixture();
    const student = await createUserWithToken(UserRole.STUDENT);
    // Since Phase 5, protected lesson content requires an active enrollment.
    await Enrollment.create({
      student: student.user._id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const l1 = await createLessonInDb(course._id, module._id, { order: 1, isPublished: true });
    await createLessonInDb(course._id, module._id, { order: 2, isPublished: false });
    const l3 = await createLessonInDb(course._id, module._id, { order: 3, isPublished: true });

    const res = await request(app)
      .get(`/api/lessons/${l1._id.toString()}`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data.context.nextLessonId).toBe(l3._id.toString());
  });

  it("blocks direct student access to unpublished lessons and modules (404)", async () => {
    const { course, module } = await createContentFixture();
    const student = await createUserWithToken(UserRole.STUDENT);
    const draftLesson = await createLessonInDb(course._id, module._id, {
      order: 1,
      isPublished: false,
    });

    const unpublishedLesson = await request(app)
      .get(`/api/lessons/${draftLesson._id.toString()}`)
      .set(auth(student.token));
    expect(unpublishedLesson.status).toBe(404);

    const hiddenModule = await createContentFixture({ modulePublished: false });
    const lessonInHiddenModule = await createLessonInDb(
      hiddenModule.course._id,
      hiddenModule.module._id,
      { order: 1, isPublished: true }
    );
    const viaHiddenModule = await request(app)
      .get(`/api/lessons/${lessonInHiddenModule._id.toString()}`)
      .set(auth(student.token));
    expect(viaHiddenModule.status).toBe(404);

    const draftCourse = await createContentFixture({ courseStatus: CourseStatus.DRAFT });
    const lessonInDraftCourse = await createLessonInDb(
      draftCourse.course._id,
      draftCourse.module._id,
      { order: 1, isPublished: true }
    );
    const viaDraftCourse = await request(app)
      .get(`/api/lessons/${lessonInDraftCourse._id.toString()}`)
      .set(auth(student.token));
    expect(viaDraftCourse.status).toBe(404);
  });

  it("published preview lessons are viewable and flagged", async () => {
    const { course, module } = await createContentFixture();
    const lesson = await createLessonInDb(course._id, module._id, {
      order: 1,
      isPublished: true,
      isPreview: true,
    });

    const res = await request(app).get(`/api/lessons/${lesson._id.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lesson.isPreview).toBe(true);
  });

  it("unpublished preview lessons stay hidden", async () => {
    const { course, module } = await createContentFixture();
    const lesson = await createLessonInDb(course._id, module._id, {
      order: 1,
      isPublished: false,
      isPreview: true,
    });

    const res = await request(app).get(`/api/lessons/${lesson._id.toString()}`);

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/lessons/:id", () => {
  it("edits a lesson and validates content when the type changes", async () => {
    const { owner, course, module } = await createContentFixture();
    const lesson = await createLessonInDb(course._id, module._id);

    const invalidSwitch = await request(app)
      .put(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(owner.token))
      .send({ type: "video" });
    expect(invalidSwitch.status).toBe(400);

    const validSwitch = await request(app)
      .put(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(owner.token))
      .send({
        type: "video",
        videoUrl: "https://vimeo.com/123456",
        title: "Now A Video",
        isPreview: true,
      });
    expect(validSwitch.status).toBe(200);
    expect(validSwitch.body.data.lesson.type).toBe("video");
    expect(validSwitch.body.data.lesson.isPreview).toBe(true);
    // Content irrelevant to the new type is cleared.
    expect(validSwitch.body.data.lesson.content).toBeUndefined();
  });

  it("blocks another instructor from editing", async () => {
    const { course, module } = await createContentFixture();
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const lesson = await createLessonInDb(course._id, module._id);

    const res = await request(app)
      .put(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(other.token))
      .send({ title: "Hijacked Lesson" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/lessons/:id/status", () => {
  it("publishes and unpublishes a lesson", async () => {
    const { owner, course, module } = await createContentFixture();
    const lesson = await createLessonInDb(course._id, module._id);

    const publish = await request(app)
      .patch(`/api/lessons/${lesson._id.toString()}/status`)
      .set(auth(owner.token))
      .send({ isPublished: true });
    expect(publish.status).toBe(200);
    expect(publish.body.message).toBe("Lesson published");

    const unpublish = await request(app)
      .patch(`/api/lessons/${lesson._id.toString()}/status`)
      .set(auth(owner.token))
      .send({ isPublished: false });
    expect(unpublish.body.message).toBe("Lesson unpublished");
  });

  it("blocks students from changing status", async () => {
    const { course, module } = await createContentFixture();
    const student = await createUserWithToken(UserRole.STUDENT);
    const lesson = await createLessonInDb(course._id, module._id);

    const res = await request(app)
      .patch(`/api/lessons/${lesson._id.toString()}/status`)
      .set(auth(student.token))
      .send({ isPublished: true });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/lessons/:id", () => {
  it("deletes a lesson and resequences the remaining orders", async () => {
    const { owner, course, module } = await createContentFixture();
    const l1 = await createLessonInDb(course._id, module._id, { order: 1 });
    const l2 = await createLessonInDb(course._id, module._id, { order: 2 });
    const l3 = await createLessonInDb(course._id, module._id, { order: 3 });
    const l4 = await createLessonInDb(course._id, module._id, { order: 4 });

    const res = await request(app)
      .delete(`/api/lessons/${l2._id.toString()}`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect((await Lesson.findById(l1._id))?.order).toBe(1);
    expect((await Lesson.findById(l3._id))?.order).toBe(2);
    expect((await Lesson.findById(l4._id))?.order).toBe(3);
  });

  it("blocks students and other instructors", async () => {
    const { course, module } = await createContentFixture();
    const student = await createUserWithToken(UserRole.STUDENT);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const lesson = await createLessonInDb(course._id, module._id);

    const asStudent = await request(app)
      .delete(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(student.token));
    const asOther = await request(app)
      .delete(`/api/lessons/${lesson._id.toString()}`)
      .set(auth(other.token));

    expect(asStudent.status).toBe(403);
    expect(asOther.status).toBe(403);
  });
});

describe("PATCH /api/modules/:moduleId/lessons/reorder", () => {
  it("reorders lessons within the module", async () => {
    const { owner, course, module } = await createContentFixture();
    const l1 = await createLessonInDb(course._id, module._id, { order: 1 });
    const l2 = await createLessonInDb(course._id, module._id, { order: 2 });
    const l3 = await createLessonInDb(course._id, module._id, { order: 3 });

    const res = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/reorder`)
      .set(auth(owner.token))
      .send({
        lessonIds: [l3._id.toString(), l1._id.toString(), l2._id.toString()],
      });

    expect(res.status).toBe(200);
    expect((await Lesson.findById(l3._id))?.order).toBe(1);
    expect((await Lesson.findById(l1._id))?.order).toBe(2);
    expect((await Lesson.findById(l2._id))?.order).toBe(3);
  });

  it("rejects lessons from another module and incomplete lists", async () => {
    const { owner, course, module } = await createContentFixture();
    const otherModule = await Module.create({
      course: course._id,
      title: "Other Module",
      order: 2,
    });
    const l1 = await createLessonInDb(course._id, module._id, { order: 1 });
    await createLessonInDb(course._id, module._id, { order: 2 });
    const foreign = await createLessonInDb(course._id, otherModule._id, { order: 1 });

    const withForeign = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/reorder`)
      .set(auth(owner.token))
      .send({ lessonIds: [l1._id.toString(), foreign._id.toString()] });
    const incomplete = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/reorder`)
      .set(auth(owner.token))
      .send({ lessonIds: [l1._id.toString()] });

    expect(withForeign.status).toBe(400);
    expect(incomplete.status).toBe(400);
  });
});
