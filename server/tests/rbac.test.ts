import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate, authorize } from "../src/middleware/auth.middleware";
import { errorHandler } from "../src/middleware/error.middleware";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

// A minimal app exercising the reusable RBAC middleware exactly as future
// phases will mount it on real routes.
const testApp = express();
const ok = (_req: express.Request, res: express.Response): void => {
  res.json({ success: true, message: "OK" });
};
testApp.get("/admin-only", authenticate, authorize(UserRole.ADMIN), ok);
testApp.get("/instructor-only", authenticate, authorize(UserRole.INSTRUCTOR), ok);
testApp.get("/student-only", authenticate, authorize(UserRole.STUDENT), ok);
testApp.get("/staff", authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), ok);
testApp.use(errorHandler);

const createUserWithToken = async (role: UserRole) => {
  const user = await User.create({
    firstName: "Test",
    lastName: role,
    email: `${role}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

describe("role-based access control", () => {
  it("allows an admin to reach an admin-only route", async () => {
    const { token } = await createUserWithToken(UserRole.ADMIN);
    const res = await request(testApp)
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("allows an instructor to reach an instructor-only route", async () => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);
    const res = await request(testApp)
      .get("/instructor-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("allows a student to reach a student-only route", async () => {
    const { token } = await createUserWithToken(UserRole.STUDENT);
    const res = await request(testApp)
      .get("/student-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(testApp).get("/admin-only");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns 403 for an authenticated user with the wrong role", async () => {
    const { token } = await createUserWithToken(UserRole.STUDENT);
    const res = await request(testApp)
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("supports multiple allowed roles", async () => {
    const admin = await createUserWithToken(UserRole.ADMIN);
    const instructor = await createUserWithToken(UserRole.INSTRUCTOR);
    const student = await createUserWithToken(UserRole.STUDENT);

    const adminRes = await request(testApp)
      .get("/staff")
      .set("Authorization", `Bearer ${admin.token}`);
    const instructorRes = await request(testApp)
      .get("/staff")
      .set("Authorization", `Bearer ${instructor.token}`);
    const studentRes = await request(testApp)
      .get("/staff")
      .set("Authorization", `Bearer ${student.token}`);

    expect(adminRes.status).toBe(200);
    expect(instructorRes.status).toBe(200);
    expect(studentRes.status).toBe(403);
  });

  it("blocks deactivated accounts even with a valid token", async () => {
    const { user, token } = await createUserWithToken(UserRole.ADMIN);
    await User.updateOne({ _id: user._id }, { isActive: false });

    const res = await request(testApp)
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
