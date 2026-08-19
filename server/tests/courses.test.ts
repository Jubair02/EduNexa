import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { Course, CourseStatus } from "../src/models/course.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let emailCounter = 0;

const createUserWithToken = async (role: UserRole) => {
  emailCounter += 1;
  const user = await User.create({
    firstName: "Course",
    lastName: role,
    email: `course-${role}-${emailCounter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const validCourseBody = {
  title: "React Fundamentals",
  description: "Learn React from the ground up, hooks included.",
  shortDescription: "React from zero",
  category: "web-development",
  level: "beginner",
  duration: 300,
};

const createCourseInDb = async (
  instructorId: string,
  overrides: Record<string, unknown> = {}
) =>
  Course.create({
    title: "Seed Course",
    slug: `seed-course-${++emailCounter}`,
    description: "A seeded course used by the test suite.",
    category: "programming",
    level: "intermediate",
    instructor: instructorId,
    status: CourseStatus.DRAFT,
    ...overrides,
  });

describe("POST /api/courses", () => {
  it("lets an instructor create a course, auto-assigned to themselves as draft", async () => {
    const { user, token } = await createUserWithToken(UserRole.INSTRUCTOR);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${token}`)
      // A sneaky instructor id in the body must be ignored.
      .send({ ...validCourseBody, instructor: other.user._id.toString() });

    expect(res.status).toBe(201);
    const { course } = res.body.data;
    expect(course.status).toBe("draft");
    expect(course.slug).toBe("react-fundamentals");
    expect(course.instructor.id).toBe(user._id.toString());
    expect(course.instructor.email).toBe(user.email);
    expect(course.instructor.password).toBeUndefined();
  });

  it("lets an admin create a course with an assigned instructor", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const instructor = await createUserWithToken(UserRole.INSTRUCTOR);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ ...validCourseBody, instructor: instructor.user._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.course.instructor.id).toBe(instructor.user._id.toString());
  });

  it("requires an instructor when an admin creates a course", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${admin.token}`)
      .send(validCourseBody);

    expect(res.status).toBe(400);
  });

  it("rejects assigning a student as instructor", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ ...validCourseBody, instructor: student.user._id.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/instructor role/i);
  });

  it("rejects a nonexistent instructor id", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ ...validCourseBody, instructor: "64b2fa8a0f1b2c3d4e5f6a7b" });

    expect(res.status).toBe(400);
  });

  it("blocks students and unauthenticated users from creating courses", async () => {
    const student = await createUserWithToken(UserRole.STUDENT);

    const asStudent = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${student.token}`)
      .send(validCourseBody);
    const anonymous = await request(app).post("/api/courses").send(validCourseBody);

    expect(asStudent.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it.each([
    ["missing title", { title: "" }],
    ["short title", { title: "ab" }],
    ["missing description", { description: "" }],
    ["invalid category", { category: "cooking" }],
    ["invalid level", { level: "expert" }],
    ["negative duration", { duration: -5 }],
    ["non-integer duration", { duration: 2.5 }],
    ["invalid thumbnail", { thumbnail: "not-a-url" }],
  ])("rejects invalid input: %s", async (_label, overrides) => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);

    const res = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validCourseBody, ...overrides });

    expect(res.status).toBe(400);
  });

  it("generates unique slugs for duplicate titles", async () => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);

    const first = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${token}`)
      .send(validCourseBody);
    const second = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${token}`)
      .send(validCourseBody);
    const third = await request(app)
      .post("/api/courses")
      .set("Authorization", `Bearer ${token}`)
      .send(validCourseBody);

    expect(first.body.data.course.slug).toBe("react-fundamentals");
    expect(second.body.data.course.slug).toBe("react-fundamentals-1");
    expect(third.body.data.course.slug).toBe("react-fundamentals-2");
  });
});

describe("GET /api/courses (visibility)", () => {
  it("shows anonymous visitors published courses only", async () => {
    const { user } = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(user._id.toString(), { status: CourseStatus.PUBLISHED });
    await createCourseInDb(user._id.toString(), { status: CourseStatus.DRAFT });
    await createCourseInDb(user._id.toString(), { status: CourseStatus.ARCHIVED });

    const res = await request(app).get("/api/courses");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("published");
  });

  it("does not let the catalog status filter expose drafts", async () => {
    const { user } = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(user._id.toString(), { status: CourseStatus.DRAFT });

    const res = await request(app).get("/api/courses?status=draft");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("shows students published courses only, even in manage view", async () => {
    const { user } = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    await createCourseInDb(user._id.toString(), { status: CourseStatus.DRAFT });

    const catalog = await request(app)
      .get("/api/courses")
      .set("Authorization", `Bearer ${student.token}`);
    const manage = await request(app)
      .get("/api/courses?view=manage")
      .set("Authorization", `Bearer ${student.token}`);

    expect(catalog.status).toBe(200);
    expect(catalog.body.data).toHaveLength(0);
    expect(manage.status).toBe(403);
  });

  it("shows instructors only their own courses in manage view", async () => {
    const alice = await createUserWithToken(UserRole.INSTRUCTOR);
    const bob = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(alice.user._id.toString(), { title: "Alice Course" });
    await createCourseInDb(bob.user._id.toString(), {
      title: "Bob Course",
      status: CourseStatus.PUBLISHED,
    });

    const res = await request(app)
      .get("/api/courses?view=manage")
      .set("Authorization", `Bearer ${alice.token}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Alice Course");
  });

  it("shows admins all courses in manage view, filterable by status and instructor", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const alice = await createUserWithToken(UserRole.INSTRUCTOR);
    const bob = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(alice.user._id.toString(), { status: CourseStatus.DRAFT });
    await createCourseInDb(bob.user._id.toString(), { status: CourseStatus.PUBLISHED });

    const all = await request(app)
      .get("/api/courses?view=manage")
      .set("Authorization", `Bearer ${admin.token}`);
    const drafts = await request(app)
      .get("/api/courses?view=manage&status=draft")
      .set("Authorization", `Bearer ${admin.token}`);
    const byInstructor = await request(app)
      .get(`/api/courses?view=manage&instructor=${bob.user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(all.body.data).toHaveLength(2);
    expect(drafts.body.data).toHaveLength(1);
    expect(byInstructor.body.data).toHaveLength(1);
  });

  it("supports search, category/level filters, pagination, and sorting together", async () => {
    const { user } = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(user._id.toString(), {
      title: "React Basics",
      category: "web-development",
      level: "beginner",
      status: CourseStatus.PUBLISHED,
    });
    await createCourseInDb(user._id.toString(), {
      title: "Advanced React Patterns",
      category: "web-development",
      level: "advanced",
      status: CourseStatus.PUBLISHED,
    });
    await createCourseInDb(user._id.toString(), {
      title: "Marketing 101",
      category: "marketing",
      level: "beginner",
      status: CourseStatus.PUBLISHED,
    });

    const search = await request(app).get("/api/courses?search=react");
    expect(search.body.data).toHaveLength(2);

    const combined = await request(app).get(
      "/api/courses?search=react&category=web-development&level=beginner"
    );
    expect(combined.body.data).toHaveLength(1);
    expect(combined.body.data[0].title).toBe("React Basics");

    const sorted = await request(app).get("/api/courses?sortBy=title&sortOrder=asc");
    expect(sorted.body.data[0].title).toBe("Advanced React Patterns");

    const page = await request(app).get("/api/courses?page=2&limit=2");
    expect(page.body.data).toHaveLength(1);
    expect(page.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });
});

describe("GET /api/courses/:idOrSlug", () => {
  it("returns a published course to anonymous visitors by slug, with safe instructor data", async () => {
    const { user } = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(user._id.toString(), {
      slug: "public-course",
      status: CourseStatus.PUBLISHED,
    });

    const res = await request(app).get("/api/courses/public-course");

    expect(res.status).toBe(200);
    const { course } = res.body.data;
    expect(course.slug).toBe("public-course");
    expect(course.instructor.firstName).toBeDefined();
    expect(course.instructor.email).toBeDefined();
    expect(course.instructor.password).toBeUndefined();
    expect(course.instructor.role).toBeUndefined();
  });

  it("hides drafts from students but shows them to the owner and admins", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await createUserWithToken(UserRole.STUDENT);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const id = course._id.toString();
    const asStudent = await request(app)
      .get(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${student.token}`);
    const asOtherInstructor = await request(app)
      .get(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${other.token}`);
    const asOwner = await request(app)
      .get(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    const asAdmin = await request(app)
      .get(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(asStudent.status).toBe(404);
    expect(asOtherInstructor.status).toBe(404);
    expect(asOwner.status).toBe(200);
    expect(asAdmin.status).toBe(200);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/courses/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/courses/:id", () => {
  it("lets the owner edit their course without changing the slug", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString(), {
      slug: "stable-slug",
    });

    const res = await request(app)
      .put(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "A Completely New Title", level: "advanced" });

    expect(res.status).toBe(200);
    expect(res.body.data.course.title).toBe("A Completely New Title");
    expect(res.body.data.course.slug).toBe("stable-slug");
  });

  it("blocks an instructor from editing another instructor's course", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const intruder = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .put(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${intruder.token}`)
      .send({ title: "Hijacked Title" });

    expect(res.status).toBe(403);
  });

  it("blocks an instructor from reassigning ownership", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const other = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .put(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ instructor: other.user._id.toString() });

    expect(res.status).toBe(403);
  });

  it("lets an admin reassign the instructor (to instructors only)", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const next = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);
    const course = await createCourseInDb(owner.user._id.toString());

    const reassign = await request(app)
      .put(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ instructor: next.user._id.toString() });
    expect(reassign.status).toBe(200);
    expect(reassign.body.data.course.instructor.id).toBe(next.user._id.toString());

    const toStudent = await request(app)
      .put(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ instructor: student.user._id.toString() });
    expect(toStudent.status).toBe(400);
  });

  it("rejects invalid ids and missing courses", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const invalid = await request(app)
      .put("/api/courses/not-an-id")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "Whatever Title" });
    const missing = await request(app)
      .put("/api/courses/64b2fa8a0f1b2c3d4e5f6a7b")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "Whatever Title" });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /api/courses/:id/status", () => {
  it("publishes and archives a course", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const id = course._id.toString();

    const publish = await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "published" });
    expect(publish.status).toBe(200);
    expect(publish.body.message).toBe("Course published");
    expect(publish.body.data.course.status).toBe("published");

    const archive = await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "archived" });
    expect(archive.body.message).toBe("Course archived");

    const backToDraft = await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "draft" });
    expect(backToDraft.body.data.course.status).toBe("draft");
  });

  it("rejects an invalid status value and a no-op transition", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());
    const id = course._id.toString();

    const invalid = await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "live" });
    const noop = await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "draft" });

    expect(invalid.status).toBe(400);
    expect(noop.status).toBe(400);
  });

  it("blocks an instructor from changing another instructor's course status", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const intruder = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .patch(`/api/courses/${course._id.toString()}/status`)
      .set("Authorization", `Bearer ${intruder.token}`)
      .send({ status: "published" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/courses/:id", () => {
  it("lets an instructor delete their own draft", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(await Course.findById(course._id)).toBeNull();
  });

  it("blocks an instructor from deleting their published course until archived", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString(), {
      status: CourseStatus.PUBLISHED,
    });
    const id = course._id.toString();

    const whilePublished = await request(app)
      .delete(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(whilePublished.status).toBe(403);

    await request(app)
      .patch(`/api/courses/${id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ status: "archived" });

    const afterArchive = await request(app)
      .delete(`/api/courses/${id}`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(afterArchive.status).toBe(200);
  });

  it("blocks an instructor from deleting another instructor's course", async () => {
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const intruder = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const res = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${intruder.token}`);

    expect(res.status).toBe(403);
  });

  it("lets an admin delete any course, even published", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString(), {
      status: CourseStatus.PUBLISHED,
    });

    const res = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
  });

  it("blocks students, validates ids, and 404s missing courses", async () => {
    const student = await createUserWithToken(UserRole.STUDENT);
    const admin = await createUserWithToken(UserRole.ADMIN);
    const owner = await createUserWithToken(UserRole.INSTRUCTOR);
    const course = await createCourseInDb(owner.user._id.toString());

    const asStudent = await request(app)
      .delete(`/api/courses/${course._id.toString()}`)
      .set("Authorization", `Bearer ${student.token}`);
    const invalid = await request(app)
      .delete("/api/courses/not-an-id")
      .set("Authorization", `Bearer ${admin.token}`);
    const missing = await request(app)
      .delete("/api/courses/64b2fa8a0f1b2c3d4e5f6a7b")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(asStudent.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe("GET /api/courses/statistics", () => {
  it("gives admins platform-wide counts", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const a = await createUserWithToken(UserRole.INSTRUCTOR);
    const b = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(a.user._id.toString(), { status: CourseStatus.PUBLISHED });
    await createCourseInDb(a.user._id.toString(), { status: CourseStatus.DRAFT });
    await createCourseInDb(b.user._id.toString(), { status: CourseStatus.ARCHIVED });

    const res = await request(app)
      .get("/api/courses/statistics")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalCourses: 3,
      published: 1,
      draft: 1,
      archived: 1,
    });
  });

  it("gives instructors counts for their own courses only", async () => {
    const a = await createUserWithToken(UserRole.INSTRUCTOR);
    const b = await createUserWithToken(UserRole.INSTRUCTOR);
    await createCourseInDb(a.user._id.toString(), { status: CourseStatus.PUBLISHED });
    await createCourseInDb(b.user._id.toString(), { status: CourseStatus.PUBLISHED });
    await createCourseInDb(b.user._id.toString(), { status: CourseStatus.DRAFT });

    const res = await request(app)
      .get("/api/courses/statistics")
      .set("Authorization", `Bearer ${b.token}`);

    expect(res.body.data).toEqual({
      totalCourses: 2,
      published: 1,
      draft: 1,
      archived: 0,
    });
  });

  it("is blocked for students and anonymous users", async () => {
    const student = await createUserWithToken(UserRole.STUDENT);

    const asStudent = await request(app)
      .get("/api/courses/statistics")
      .set("Authorization", `Bearer ${student.token}`);
    const anonymous = await request(app).get("/api/courses/statistics");

    expect(asStudent.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});
