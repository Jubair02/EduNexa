import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

const createUserWithToken = async (
  role: UserRole,
  overrides: Record<string, unknown> = {}
) => {
  const user = await User.create({
    firstName: "Base",
    lastName: role,
    email: `${role}-base@example.com`,
    password: "sufficiently-long-password",
    role,
    ...overrides,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

const seedUsers = async (count: number, role = UserRole.STUDENT) => {
  for (let i = 0; i < count; i += 1) {
    // Sequential creates keep createdAt ordering deterministic.
    await User.create({
      firstName: `Seed${i}`,
      lastName: "User",
      email: `seed${i}@example.com`,
      password: "sufficiently-long-password",
      role,
    });
  }
};

describe("user management authorization", () => {
  it("rejects unauthenticated access with 401", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it.each([[UserRole.STUDENT], [UserRole.INSTRUCTOR]])(
    "rejects %s access with 403",
    async (role) => {
      const { token } = await createUserWithToken(role);
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  );

  it("allows admin access", async () => {
    const { token } = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/users", () => {
  let adminToken: string;

  beforeEach(async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    adminToken = admin.token;
  });

  const get = (qs = "") =>
    request(app).get(`/api/users${qs}`).set("Authorization", `Bearer ${adminToken}`);

  it("paginates results with metadata", async () => {
    await seedUsers(15);

    const page1 = await get("?page=1&limit=10");
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(10);
    expect(page1.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 16, // 15 seeded + admin
      totalPages: 2,
    });

    const page2 = await get("?page=2&limit=10");
    expect(page2.body.data).toHaveLength(6);

    const ids1 = page1.body.data.map((u: { id: string }) => u.id);
    const ids2 = page2.body.data.map((u: { id: string }) => u.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
  });

  it("never includes passwords in list results", async () => {
    await seedUsers(3);
    const res = await get();
    for (const user of res.body.data) {
      expect(user.password).toBeUndefined();
    }
  });

  it("searches by first name, last name, and email", async () => {
    await User.create({
      firstName: "John",
      lastName: "Carpenter",
      email: "director@example.com",
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });
    await seedUsers(3);

    const byFirst = await get("?search=john");
    expect(byFirst.body.data).toHaveLength(1);
    expect(byFirst.body.data[0].firstName).toBe("John");

    const byLast = await get("?search=carpenter");
    expect(byLast.body.data).toHaveLength(1);

    const byEmail = await get("?search=director@");
    expect(byEmail.body.data).toHaveLength(1);
  });

  it("searches by full name", async () => {
    await User.create({
      firstName: "John",
      lastName: "Carpenter",
      email: "director@example.com",
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });

    const res = await get("?search=john%20carpenter");
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe("director@example.com");
  });

  it("filters by role and status, combined with search", async () => {
    await User.create({
      firstName: "Ina",
      lastName: "Active",
      email: "ina@example.com",
      password: "sufficiently-long-password",
      role: UserRole.INSTRUCTOR,
      isActive: false,
    });
    await User.create({
      firstName: "Ada",
      lastName: "Active",
      email: "ada-instructor@example.com",
      password: "sufficiently-long-password",
      role: UserRole.INSTRUCTOR,
    });
    await seedUsers(2);

    const instructors = await get("?role=instructor");
    expect(instructors.body.data).toHaveLength(2);

    const inactive = await get("?status=inactive");
    expect(inactive.body.data).toHaveLength(1);
    expect(inactive.body.data[0].email).toBe("ina@example.com");

    const combined = await get("?search=active&role=instructor&status=active");
    expect(combined.body.data).toHaveLength(1);
    expect(combined.body.data[0].email).toBe("ada-instructor@example.com");
  });

  it("sorts by the requested field and direction", async () => {
    await User.create({
      firstName: "Aaa",
      lastName: "First",
      email: "aaa@example.com",
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });
    await User.create({
      firstName: "Zzz",
      lastName: "Last",
      email: "zzz@example.com",
      password: "sufficiently-long-password",
      role: UserRole.STUDENT,
    });

    const asc = await get("?sortBy=firstName&sortOrder=asc");
    expect(asc.body.data[0].firstName).toBe("Aaa");

    const desc = await get("?sortBy=firstName&sortOrder=desc");
    expect(desc.body.data[0].firstName).toBe("Zzz");
  });

  it("rejects invalid query values with 400", async () => {
    const res = await get("?role=superadmin");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/users/:id", () => {
  it("returns a user's safe details", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .get(`/api/users/${user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: user._id.toString(),
      email: user.email,
      role: "student",
    });
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.createdAt).toBeDefined();
    expect(res.body.data.user.updatedAt).toBeDefined();
  });

  it("rejects an invalid ObjectId with 400", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .get("/api/users/not-an-id")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a missing user", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .get("/api/users/64b2fa8a0f1b2c3d4e5f6a7b")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/users", () => {
  let adminToken: string;

  beforeEach(async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    adminToken = admin.token;
  });

  const create = (body: Record<string, unknown>) =>
    request(app).post("/api/users").set("Authorization", `Bearer ${adminToken}`).send(body);

  const validBody = {
    firstName: "New",
    lastName: "Instructor",
    email: "new-instructor@example.com",
    password: "instructor-password",
    role: "instructor",
  };

  it("creates a user with the given role", async () => {
    const res = await create(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("instructor");
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("can create admins and students too", async () => {
    const admin = await create({ ...validBody, email: "a2@example.com", role: "admin" });
    const student = await create({ ...validBody, email: "s2@example.com", role: "student" });
    expect(admin.body.data.user.role).toBe("admin");
    expect(student.body.data.user.role).toBe("student");
  });

  it("hashes the password", async () => {
    await create(validBody);
    const doc = await User.findOne({ email: validBody.email }).select("+password");
    expect(doc?.password).toMatch(/^\$2[aby]\$/);
    expect(doc?.password).not.toBe(validBody.password);
  });

  it("rejects a duplicate email with 409", async () => {
    await create(validBody);
    const res = await create(validBody);
    expect(res.status).toBe(409);
  });

  it("rejects an invalid role with 400", async () => {
    const res = await create({ ...validBody, role: "superadmin" });
    expect(res.status).toBe(400);
  });

  it("rejects missing fields with 400", async () => {
    const res = await create({ email: "x@example.com" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/users/:id", () => {
  it("updates profile fields, role, and status", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        firstName: "Renamed",
        lastName: "Person",
        email: "renamed@example.com",
        role: "instructor",
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      firstName: "Renamed",
      email: "renamed@example.com",
      role: "instructor",
      isActive: false,
    });
  });

  it("does not touch the password on edit", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await User.create({
      firstName: "Keep",
      lastName: "Password",
      email: "keep@example.com",
      password: "original-password",
      role: UserRole.STUDENT,
    });

    await request(app)
      .put(`/api/users/${student._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ firstName: "Kept", password: "" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "keep@example.com", password: "original-password" });
    expect(login.status).toBe(200);
  });

  it("rejects a duplicate email with 409", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ email: admin.user.email });

    expect(res.status).toBe(409);
  });

  it("prevents an admin changing their own role", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const res = await request(app)
      .put(`/api/users/${admin.user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ role: "student" });

    expect(res.status).toBe(403);
  });

  it("rejects an empty update with 400", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/users/:id/status", () => {
  it("deactivates a user, who then cannot log in", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await User.create({
      firstName: "Soon",
      lastName: "Inactive",
      email: "soon-inactive@example.com",
      password: "student-password-1",
      role: UserRole.STUDENT,
    });

    const res = await request(app)
      .patch(`/api/users/${student._id.toString()}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deactivated");
    expect(res.body.data.user.isActive).toBe(false);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "soon-inactive@example.com", password: "student-password-1" });
    expect(login.status).toBe(403);
  });

  it("deactivated users are rejected on authenticated routes despite a valid token", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const student = await createUserWithToken(UserRole.STUDENT);

    await request(app)
      .patch(`/api/users/${student.user._id.toString()}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: false });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${student.token}`);
    expect(me.status).toBe(403);
  });

  it("reactivates a user", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT, {
      isActive: false,
      email: "reactivate@example.com",
    });

    const res = await request(app)
      .patch(`/api/users/${user._id.toString()}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: true });

    expect(res.body.message).toBe("User activated");
    expect(res.body.data.user.isActive).toBe(true);
  });

  it("prevents self-deactivation", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const res = await request(app)
      .patch(`/api/users/${admin.user._id.toString()}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });

  it("rejects a non-boolean isActive with 400", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .patch(`/api/users/${user._id.toString()}/status`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ isActive: "nope" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/users/:id", () => {
  it("deletes a user", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const { user } = await createUserWithToken(UserRole.STUDENT);

    const res = await request(app)
      .delete(`/api/users/${user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(await User.findById(user._id)).toBeNull();
  });

  it("returns 404 when the user does not exist", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .delete("/api/users/64b2fa8a0f1b2c3d4e5f6a7b")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });

  it("rejects an invalid id with 400", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const res = await request(app)
      .delete("/api/users/definitely-not-an-id")
      .set("Authorization", `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it("prevents an admin deleting their own account", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);

    const res = await request(app)
      .delete(`/api/users/${admin.user._id.toString()}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(403);
    expect(await User.findById(admin.user._id)).not.toBeNull();
  });
});

describe("GET /api/users/statistics", () => {
  it("computes counts from the database", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    await seedUsers(3, UserRole.STUDENT);
    await seedUsers(0, UserRole.INSTRUCTOR);
    await User.create({
      firstName: "Ina",
      lastName: "Structor",
      email: "ina-stats@example.com",
      password: "sufficiently-long-password",
      role: UserRole.INSTRUCTOR,
      isActive: false,
    });

    const res = await request(app)
      .get("/api/users/statistics")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalUsers: 5,
      students: 3,
      instructors: 1,
      admins: 1,
      activeUsers: 4,
      inactiveUsers: 1,
    });
  });

  it("is admin-only", async () => {
    const { token } = await createUserWithToken(UserRole.STUDENT);
    const res = await request(app)
      .get("/api/users/statistics")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/users/recent", () => {
  it("returns the most recently registered users, newest first", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    await seedUsers(8);

    const res = await request(app)
      .get("/api/users/recent")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(6);
    const dates = res.body.data.map((u: { createdAt: string }) =>
      new Date(u.createdAt).getTime()
    );
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it("is admin-only", async () => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);
    const res = await request(app)
      .get("/api/users/recent")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
