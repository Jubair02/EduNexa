import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { Lesson, LessonType } from "../src/models/lesson.model";
import { Module } from "../src/models/module.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUserWithToken = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Mod",
    lastName: role,
    email: `mod-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const createCourseInDb = async (instructorId: string, overrides: Record<string, unknown> = {}) =>
  Course.create({
    title: "Module Host Course",
    slug: `module-host-${++counter}`,
    description: "A course that hosts modules for tests.",
    category: "programming",
    level: "beginner",
    instructor: instructorId,
    status: CourseStatus.PUBLISHED,
    ...overrides,
  });

const createModuleInDb = async (courseId: unknown, overrides: Record<string, unknown> = {}) =>
  Module.create({
    course: courseId,
    title: `Module ${++counter}`,
    order: (overrides.order as number) ?? 1,
    ...overrides,
  });

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("POST /api/courses/:courseId/modules", () => {
  it("creates modules with sequential orders, unpublished by default", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const first = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(owner.token))
      .send({ title: "Introduction", description: "Course introduction" });
    const second = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(owner.token))
      .send({ title: "Fundamentals" });

    expect(first.status).toBe(201);
    expect(first.body.data.module.order).toBe(1);
    expect(first.body.data.module.isPublished).toBe(false);
    expect(second.body.data.module.order).toBe(2);
  });

  it("blocks other instructors and students", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const course = await createCourseInDb(owner.user._id.toString());

    const asOther = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(other.token))
      .send({ title: "Hijack Module" });
    const asStudent = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(student.token))
      .send({ title: "Student Module" });

    expect(asOther.status).toBe(403);
    expect(asStudent.status).toBe(403);
  });

  it("lets an admin add modules to any course", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const admin = await createUserWithToken(UserRole.ADMIN);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(admin.token))
      .send({ title: "Admin Module" });

    expect(res.status).toBe(201);
  });

  it("rejects an invalid course id and a missing course", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const invalid = await request(app)
      .post("/api/courses/not-an-id/modules")
      .set(auth(admin.token))
      .send({ title: "Whatever Module" });
    const missing = await request(app)
      .post("/api/courses/64b2fa8a0f1b2c3d4e5f6a7b/modules")
      .set(auth(admin.token))
      .send({ title: "Whatever Module" });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  it("validates the title", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .post(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(owner.token))
      .send({ title: "ab" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/courses/:courseId/modules", () => {
  it("returns all modules with lesson counts for the owner, sorted by order", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const m1 = await createModuleInDb(course._id, { order: 1, isPublished: true });
    await createModuleInDb(course._id, { order: 2 });
    await Lesson.create({
      module: m1._id,
      course: course._id,
      title: "Counted Lesson",
      type: LessonType.TEXT,
      content: "Some text lesson body.",
      order: 1,
    });

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].order).toBe(1);
    expect(res.body.data[0].lessonCount).toBe(1);
    expect(res.body.data[1].lessonCount).toBe(0);
  });

  it("shows students only published modules with published lesson counts", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const course = await createCourseInDb(owner.user._id.toString());
    const published = await createModuleInDb(course._id, { order: 1, isPublished: true });
    await createModuleInDb(course._id, { order: 2, isPublished: false });
    await Lesson.create({
      module: published._id,
      course: course._id,
      title: "Published Lesson",
      type: LessonType.TEXT,
      content: "Visible body.",
      order: 1,
      isPublished: true,
    });
    await Lesson.create({
      module: published._id,
      course: course._id,
      title: "Draft Lesson",
      type: LessonType.TEXT,
      content: "Hidden body.",
      order: 2,
      isPublished: false,
    });

    const res = await request(app)
      .get(`/api/courses/${course._id.toString()}/modules`)
      .set(auth(student.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isPublished).toBe(true);
    expect(res.body.data[0].lessonCount).toBe(1);
  });

  it("hides modules of unpublished courses from students and anonymous visitors", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString(), {
      status: CourseStatus.DRAFT,
    });
    await createModuleInDb(course._id, { order: 1, isPublished: true });

    const anonymous = await request(app).get(
      `/api/courses/${course._id.toString()}/modules`
    );

    expect(anonymous.status).toBe(404);
  });
});

describe("PUT /api/modules/:id", () => {
  it("lets the owner edit title and description", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id);

    const res = await request(app)
      .put(`/api/modules/${module._id.toString()}`)
      .set(auth(owner.token))
      .send({ title: "Renamed Module", description: "Now with description" });

    expect(res.status).toBe(200);
    expect(res.body.data.module.title).toBe("Renamed Module");
  });

  it("blocks another instructor", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id);

    const res = await request(app)
      .put(`/api/modules/${module._id.toString()}`)
      .set(auth(other.token))
      .send({ title: "Hijacked Module" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/modules/:id/status", () => {
  it("publishes and unpublishes a module", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id);

    const publish = await request(app)
      .patch(`/api/modules/${module._id.toString()}/status`)
      .set(auth(owner.token))
      .send({ isPublished: true });
    expect(publish.status).toBe(200);
    expect(publish.body.message).toBe("Module published");
    expect(publish.body.data.module.isPublished).toBe(true);

    const unpublish = await request(app)
      .patch(`/api/modules/${module._id.toString()}/status`)
      .set(auth(owner.token))
      .send({ isPublished: false });
    expect(unpublish.body.message).toBe("Module unpublished");
  });

  it("rejects students and non-boolean values", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id);

    const asStudent = await request(app)
      .patch(`/api/modules/${module._id.toString()}/status`)
      .set(auth(student.token))
      .send({ isPublished: true });
    const invalid = await request(app)
      .patch(`/api/modules/${module._id.toString()}/status`)
      .set(auth(owner.token))
      .send({ isPublished: "yes" });

    expect(asStudent.status).toBe(403);
    expect(invalid.status).toBe(400);
  });
});

describe("DELETE /api/modules/:id", () => {
  it("deletes an empty module and resequences the rest", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const m1 = await createModuleInDb(course._id, { order: 1 });
    const m2 = await createModuleInDb(course._id, { order: 2 });
    const m3 = await createModuleInDb(course._id, { order: 3 });

    const res = await request(app)
      .delete(`/api/modules/${m2._id.toString()}`)
      .set(auth(owner.token));

    expect(res.status).toBe(200);
    expect((await Module.findById(m1._id))?.order).toBe(1);
    expect((await Module.findById(m3._id))?.order).toBe(2);
  });

  it("refuses to delete a module that contains lessons", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id);
    await Lesson.create({
      module: module._id,
      course: course._id,
      title: "Blocking Lesson",
      type: LessonType.TEXT,
      content: "Blocks module deletion.",
      order: 1,
    });

    const res = await request(app)
      .delete(`/api/modules/${module._id.toString()}`)
      .set(auth(owner.token));

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      "Cannot delete a module that contains lessons. Delete or move its lessons first."
    );
    expect(await Module.findById(module._id)).not.toBeNull();
  });
});

describe("PATCH /api/courses/:courseId/modules/reorder", () => {
  it("reorders modules according to the given id sequence", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const m1 = await createModuleInDb(course._id, { order: 1 });
    const m2 = await createModuleInDb(course._id, { order: 2 });
    const m3 = await createModuleInDb(course._id, { order: 3 });

    const res = await request(app)
      .patch(`/api/courses/${course._id.toString()}/modules/reorder`)
      .set(auth(owner.token))
      .send({
        moduleIds: [m3._id.toString(), m1._id.toString(), m2._id.toString()],
      });

    expect(res.status).toBe(200);
    expect((await Module.findById(m3._id))?.order).toBe(1);
    expect((await Module.findById(m1._id))?.order).toBe(2);
    expect((await Module.findById(m2._id))?.order).toBe(3);
  });

  it("rejects incomplete lists, duplicates, and foreign modules", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const otherCourse = await createCourseInDb(owner.user._id.toString());
    const m1 = await createModuleInDb(course._id, { order: 1 });
    const m2 = await createModuleInDb(course._id, { order: 2 });
    const foreign = await createModuleInDb(otherCourse._id, { order: 1 });

    const incomplete = await request(app)
      .patch(`/api/courses/${course._id.toString()}/modules/reorder`)
      .set(auth(owner.token))
      .send({ moduleIds: [m1._id.toString()] });
    const duplicates = await request(app)
      .patch(`/api/courses/${course._id.toString()}/modules/reorder`)
      .set(auth(owner.token))
      .send({ moduleIds: [m1._id.toString(), m1._id.toString()] });
    const foreignRes = await request(app)
      .patch(`/api/courses/${course._id.toString()}/modules/reorder`)
      .set(auth(owner.token))
      .send({ moduleIds: [m1._id.toString(), foreign._id.toString()] });

    expect(incomplete.status).toBe(400);
    expect(duplicates.status).toBe(400);
    expect(foreignRes.status).toBe(400);
    expect((await Module.findById(m2._id))?.order).toBe(2);
  });

  it("blocks another instructor from reordering", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const m1 = await createModuleInDb(course._id, { order: 1 });

    const res = await request(app)
      .patch(`/api/courses/${course._id.toString()}/modules/reorder`)
      .set(auth(other.token))
      .send({ moduleIds: [m1._id.toString()] });

    expect(res.status).toBe(403);
  });
});

describe("course deletion integrity", () => {
  it("refuses to delete a course that still contains modules", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString(), {
      status: CourseStatus.DRAFT,
    });
    const module = await createModuleInDb(course._id);

    const blocked = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set(auth(admin.token));
    expect(blocked.status).toBe(409);

    await request(app)
      .delete(`/api/modules/${module._id.toString()}`)
      .set(auth(admin.token));
    const allowed = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set(auth(admin.token));
    expect(allowed.status).toBe(200);
  });
});

describe("course content statistics", () => {
  it("includes contentStats in course details for the owner only", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const course = await createCourseInDb(owner.user._id.toString());
    const module = await createModuleInDb(course._id, { order: 1, isPublished: true });
    await createModuleInDb(course._id, { order: 2 });
    await Lesson.create({
      module: module._id,
      course: course._id,
      title: "Stat Lesson",
      type: LessonType.TEXT,
      content: "Counted in stats.",
      order: 1,
      isPublished: true,
    });

    const asOwner = await request(app)
      .get(`/api/courses/${course._id.toString()}`)
      .set(auth(owner.token));
    const asStudent = await request(app)
      .get(`/api/courses/${course._id.toString()}`)
      .set(auth(student.token));

    expect(asOwner.body.data.course.contentStats).toEqual({
      totalModules: 2,
      publishedModules: 1,
      totalLessons: 1,
      publishedLessons: 1,
    });
    expect(asStudent.body.data.course.contentStats).toBeUndefined();
  });
});
