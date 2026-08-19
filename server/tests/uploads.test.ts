import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";
import { isStorageConfigured } from "../src/utils/fileStorage";

let counter = 0;

const createUserWithToken = async (role: UserRole) => {
  counter += 1;
  const user = await User.create({
    firstName: "Up",
    lastName: role,
    email: `up-${role}-${counter}@example.com`,
    password: "sufficiently-long-password",
    role,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

describe("POST /api/uploads", () => {
  it("storage is disabled in the test environment", () => {
    expect(isStorageConfigured()).toBe(false);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/uploads?kind=image");
    expect(res.status).toBe(401);
  });

  it("rejects students", async () => {
    const { token } = await createUserWithToken(UserRole.STUDENT);
    const res = await request(app)
      .post("/api/uploads?kind=image")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake"), "photo.png");
    expect(res.status).toBe(403);
  });

  it("rejects an unknown kind", async () => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);
    const res = await request(app)
      .post("/api/uploads?kind=archive")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake"), "photo.png");
    expect(res.status).toBe(400);
  });

  it("returns 503 when no storage provider is configured", async () => {
    const { token } = await createUserWithToken(UserRole.INSTRUCTOR);
    const res = await request(app)
      .post("/api/uploads?kind=image")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake"), "photo.png");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
