/**
 * Bulk actions. The rules that matter are the refusals: a batch must never
 * quietly do something different from what was asked, and must never be the
 * back door around a rule the single-item route enforces.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { Lesson, LessonType } from "../src/models/lesson.model";
import { Module } from "../src/models/module.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;

const createUser = async (role: UserRole, isActive = true) => {
  counter += 1;
  const user = await User.create({
    firstName: "Bulk",
    lastName: `${role}${counter}`,
    email: `bulk-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
    isActive,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const buildModule = async (instructorId: string, lessonCount = 3) => {
  counter += 1;
  const course = await Course.create({
    title: `Bulk Course ${counter}`,
    slug: `bulk-course-${counter}`,
    description: "A course used by the bulk tests.",
    category: "programming",
    level: "beginner",
    instructor: instructorId,
    status: CourseStatus.DRAFT,
  });
  const module = await Module.create({
    course: course._id,
    title: "Bulk Module",
    order: 1,
    isPublished: false,
  });
  const lessons = [];
  for (let index = 1; index <= lessonCount; index += 1) {
    lessons.push(
      await Lesson.create({
        course: course._id,
        module: module._id,
        title: `Bulk Lesson ${index}`,
        type: LessonType.TEXT,
        content: "Body.",
        order: index,
        isPublished: false,
      })
    );
  }
  return { course, module, lessons };
};

describe("PATCH /api/users/bulk-status", () => {
  it("deactivates several accounts in one request", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const a = await createUser(UserRole.STUDENT);
    const b = await createUser(UserRole.STUDENT);
    const untouched = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({
        userIds: [a.user._id.toString(), b.user._id.toString()],
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ requested: 2, affected: 2 });
    expect(res.body.message).toBe("2 accounts deactivated");

    expect((await User.findById(a.user._id))?.isActive).toBe(false);
    expect((await User.findById(b.user._id))?.isActive).toBe(false);
    expect((await User.findById(untouched.user._id))?.isActive).toBe(true);
  });

  it("reactivates several accounts, and they can log in again", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const disabled = await createUser(UserRole.STUDENT, false);

    const blocked = await request(app).post("/api/auth/login").send({
      email: disabled.user.email,
      password: "sufficiently-long-password",
    });
    expect(blocked.status).toBe(403);

    await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({ userIds: [disabled.user._id.toString()], isActive: true });

    const allowed = await request(app).post("/api/auth/login").send({
      email: disabled.user.email,
      password: "sufficiently-long-password",
    });
    expect(allowed.status).toBe(200);
  });

  it("refuses a batch containing the caller rather than silently skipping them", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const other = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({
        userIds: [other.user._id.toString(), admin.user._id.toString()],
        isActive: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/your own account/i);
    // Nothing happened at all — not even to the other account in the batch.
    expect((await User.findById(other.user._id))?.isActive).toBe(true);
    expect((await User.findById(admin.user._id))?.isActive).toBe(true);
  });

  it("lets the caller reactivate a batch that includes themselves", async () => {
    const admin = await createUser(UserRole.ADMIN);

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({ userIds: [admin.user._id.toString()], isActive: true });

    // Only deactivation is dangerous; activating yourself is harmless.
    expect(res.status).toBe(200);
  });

  it("counts a repeated id once", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const target = await createUser(UserRole.STUDENT);
    const id = target.user._id.toString();

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({ userIds: [id, id, id], isActive: false });

    expect(res.body.data).toEqual({ requested: 1, affected: 1 });
  });

  it("reports ids that no longer exist as unaffected", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const real = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({
        userIds: [real.user._id.toString(), "000000000000000000000000"],
        isActive: false,
      });

    // Two asked for, one exists — the gap is what tells the admin something
    // in their selection is stale.
    expect(res.body.data).toEqual({ requested: 2, affected: 1 });
    expect(res.body.message).toBe("1 account deactivated");
  });

  it("counts an account that was already in the requested state", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const already = await createUser(UserRole.STUDENT, false);
    const active = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/users/bulk-status")
      .set(auth(admin.token))
      .send({
        userIds: [already.user._id.toString(), active.user._id.toString()],
        isActive: false,
      });

    // Both are deactivated afterwards, which is what the message claims —
    // "affected" is the end state, not the number of values that flipped.
    expect(res.body.data).toEqual({ requested: 2, affected: 2 });
  });

  it("validates the batch and is admin-only", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const url = "/api/users/bulk-status";

    for (const body of [
      {},
      { userIds: [], isActive: false },
      { userIds: ["not-an-id"], isActive: false },
      { userIds: [student.user._id.toString()] },
      { userIds: Array.from({ length: 101 }, () => student.user._id.toString()), isActive: false },
    ]) {
      const res = await request(app).patch(url).set(auth(admin.token)).send(body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }

    const body = { userIds: [student.user._id.toString()], isActive: false };
    expect((await request(app).patch(url).set(auth(student.token)).send(body)).status).toBe(
      403
    );
    expect(
      (await request(app).patch(url).set(auth(instructor.token)).send(body)).status
    ).toBe(403);
    expect((await request(app).patch(url).send(body)).status).toBe(401);
  });
});

describe("POST /api/users/bulk-delete", () => {
  it("deletes several accounts in one request", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const a = await createUser(UserRole.STUDENT);
    const b = await createUser(UserRole.STUDENT);
    const keep = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .post("/api/users/bulk-delete")
      .set(auth(admin.token))
      .send({ userIds: [a.user._id.toString(), b.user._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ requested: 2, affected: 2 });
    expect(await User.findById(a.user._id)).toBeNull();
    expect(await User.findById(b.user._id)).toBeNull();
    expect(await User.findById(keep.user._id)).not.toBeNull();
  });

  it("refuses a batch containing the caller, and deletes nothing", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const other = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .post("/api/users/bulk-delete")
      .set(auth(admin.token))
      .send({ userIds: [other.user._id.toString(), admin.user._id.toString()] });

    expect(res.status).toBe(400);
    expect(await User.findById(other.user._id)).not.toBeNull();
    expect(await User.findById(admin.user._id)).not.toBeNull();
  });

  it("is admin-only", async () => {
    const student = await createUser(UserRole.STUDENT);
    const target = await createUser(UserRole.STUDENT);
    const body = { userIds: [target.user._id.toString()] };
    const url = "/api/users/bulk-delete";

    expect((await request(app).post(url).set(auth(student.token)).send(body)).status).toBe(
      403
    );
    expect((await request(app).post(url).send(body)).status).toBe(401);
    expect(await User.findById(target.user._id)).not.toBeNull();
  });
});

describe("PATCH /api/modules/:moduleId/lessons/bulk-status", () => {
  it("publishes several lessons at once", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { module, lessons } = await buildModule(instructor.user._id.toString());

    const res = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/bulk-status`)
      .set(auth(instructor.token))
      .send({
        lessonIds: [lessons[0]._id.toString(), lessons[1]._id.toString()],
        isPublished: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ requested: 2, affected: 2 });
    expect(res.body.message).toBe("2 lessons published");

    expect((await Lesson.findById(lessons[0]._id))?.isPublished).toBe(true);
    expect((await Lesson.findById(lessons[1]._id))?.isPublished).toBe(true);
    expect((await Lesson.findById(lessons[2]._id))?.isPublished).toBe(false);
  });

  it("unpublishes several lessons at once", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { module, lessons } = await buildModule(instructor.user._id.toString());
    await Lesson.updateMany({ module: module._id }, { isPublished: true });

    const res = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/bulk-status`)
      .set(auth(instructor.token))
      .send({
        lessonIds: lessons.map((lesson) => lesson._id.toString()),
        isPublished: false,
      });

    expect(res.body.data).toEqual({ requested: 3, affected: 3 });
    expect(await Lesson.countDocuments({ module: module._id, isPublished: true })).toBe(0);
  });

  it("refuses a lesson from another module and changes nothing", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const mine = await buildModule(instructor.user._id.toString());
    const other = await buildModule(instructor.user._id.toString());

    const res = await request(app)
      .patch(`/api/modules/${mine.module._id.toString()}/lessons/bulk-status`)
      .set(auth(instructor.token))
      .send({
        lessonIds: [mine.lessons[0]._id.toString(), other.lessons[0]._id.toString()],
        isPublished: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/do not belong to this module/i);
    expect((await Lesson.findById(mine.lessons[0]._id))?.isPublished).toBe(false);
  });

  it("stops another instructor and every student", async () => {
    const owner = await createUser(UserRole.INSTRUCTOR);
    const rival = await createUser(UserRole.INSTRUCTOR);
    const student = await createUser(UserRole.STUDENT);
    const { module, lessons } = await buildModule(owner.user._id.toString());
    const url = `/api/modules/${module._id.toString()}/lessons/bulk-status`;
    const body = { lessonIds: [lessons[0]._id.toString()], isPublished: true };

    expect((await request(app).patch(url).set(auth(rival.token)).send(body)).status).toBe(
      403
    );
    expect((await request(app).patch(url).set(auth(student.token)).send(body)).status).toBe(
      403
    );
    expect((await request(app).patch(url).send(body)).status).toBe(401);
    expect((await Lesson.findById(lessons[0]._id))?.isPublished).toBe(false);
  });

  it("lets an admin publish any instructor's lessons", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const admin = await createUser(UserRole.ADMIN);
    const { module, lessons } = await buildModule(instructor.user._id.toString());

    const res = await request(app)
      .patch(`/api/modules/${module._id.toString()}/lessons/bulk-status`)
      .set(auth(admin.token))
      .send({ lessonIds: [lessons[0]._id.toString()], isPublished: true });

    expect(res.status).toBe(200);
  });

  it("validates the batch", async () => {
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const { module, lessons } = await buildModule(instructor.user._id.toString());
    const url = `/api/modules/${module._id.toString()}/lessons/bulk-status`;

    for (const body of [
      {},
      { lessonIds: [], isPublished: true },
      { lessonIds: ["nope"], isPublished: true },
      { lessonIds: [lessons[0]._id.toString()] },
    ]) {
      expect(
        (await request(app).patch(url).set(auth(instructor.token)).send(body)).status
      ).toBe(400);
    }

    // A repeated id counts once.
    const id = lessons[0]._id.toString();
    const deduped = await request(app)
      .patch(url)
      .set(auth(instructor.token))
      .send({ lessonIds: [id, id], isPublished: true });
    expect(deduped.body.data).toEqual({ requested: 1, affected: 1 });
  });
});
