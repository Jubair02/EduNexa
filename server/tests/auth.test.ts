import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { env } from "../src/config/env";
import { User, UserRole } from "../src/models/user.model";
import { signToken, verifyToken } from "../src/utils/jwt";

const validRegistration = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  password: "correct-horse-battery",
};

const registerUser = (overrides: Record<string, unknown> = {}) =>
  request(app)
    .post("/api/auth/register")
    .send({ ...validRegistration, ...overrides });

describe("POST /api/auth/register", () => {
  it("registers a student and returns a token and safe user", async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));

    const { user } = res.body.data;
    expect(user.email).toBe("ada@example.com");
    expect(user.firstName).toBe("Ada");
    expect(user.role).toBe("student");
    expect(user.isActive).toBe(true);
    expect(user.password).toBeUndefined();

    const payload = verifyToken(res.body.data.token);
    expect(payload.userId).toBe(user.id);
    expect(payload.role).toBe("student");
  });

  it("ignores a role supplied by the client — never registers admins", async () => {
    const res = await registerUser({ role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("student");
  });

  it("normalizes the email to lowercase", async () => {
    const res = await registerUser({ email: "  ADA@Example.COM " });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("ada@example.com");
  });

  it("stores a bcrypt hash, never the plain-text password", async () => {
    await registerUser();

    const doc = await User.findOne({ email: "ada@example.com" }).select("+password");
    expect(doc).not.toBeNull();
    expect(doc?.password).not.toBe(validRegistration.password);
    expect(doc?.password).toMatch(/^\$2[aby]\$/);
  });

  it("excludes the password from default queries and JSON serialization", async () => {
    await registerUser();

    const doc = await User.findOne({ email: "ada@example.com" });
    expect(doc?.password).toBeUndefined();

    const withPassword = await User.findOne({ email: "ada@example.com" }).select("+password");
    const json = withPassword?.toJSON() as Record<string, unknown>;
    expect(json.password).toBeUndefined();
    expect(json.id).toEqual(expect.any(String));
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser();
    const res = await registerUser();

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: "Email is already registered" });
  });

  it("rejects a duplicate email regardless of casing", async () => {
    await registerUser();
    const res = await registerUser({ email: "ADA@EXAMPLE.COM" });

    expect(res.status).toBe(409);
  });

  it.each([
    ["missing firstName", { firstName: "" }],
    ["missing lastName", { lastName: "" }],
    ["invalid email", { email: "not-an-email" }],
    ["short password", { password: "short" }],
  ])("rejects invalid input: %s", async (_label, overrides) => {
    const res = await registerUser(overrides);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("rejects an empty body with per-field errors", async () => {
    const res = await request(app).post("/api/auth/register").send({});

    expect(res.status).toBe(400);
    const fields = (res.body.errors as Array<{ field: string }>).map((e) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(["firstName", "lastName", "email", "password"])
    );
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validRegistration.email, password: validRegistration.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Login successful");
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe("ada@example.com");
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("rejects a wrong password with 401", async () => {
    await registerUser();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validRegistration.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid credentials" });
  });

  it("rejects an unknown email with the same 401 message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "irrelevant-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: "Invalid credentials" });
  });

  it("rejects missing credentials with 400", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("rejects an invalid email format with 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "whatever-password" });

    expect(res.status).toBe(400);
  });

  it("rejects a deactivated account with 403", async () => {
    await registerUser();
    await User.updateOne({ email: validRegistration.email }, { isActive: false });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validRegistration.email, password: validRegistration.password });

    expect(res.status).toBe(403);
  });
});

describe("JWT", () => {
  it("round-trips sign and verify with minimal claims", () => {
    const token = signToken({ userId: "64b2fa8a0f1b2c3d4e5f6a7b", role: UserRole.STUDENT });
    const payload = verifyToken(token);

    expect(payload.userId).toBe("64b2fa8a0f1b2c3d4e5f6a7b");
    expect(payload.role).toBe("student");
  });

  it("rejects a malformed token", () => {
    expect(() => verifyToken("garbage.token.value")).toThrow();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const registration = await registerUser();
    const userId = registration.body.data.user.id as string;
    const forged = jwt.sign({ userId, role: "admin" }, "some-other-secret");

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const registration = await registerUser();
    const userId = registration.body.data.user.id as string;
    const expired = jwt.sign({ userId, role: "student" }, env.JWT_SECRET, {
      expiresIn: -10,
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user's safe profile when authenticated", async () => {
    const registration = await registerUser();
    const token = registration.body.data.token as string;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      role: "student",
    });
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects a valid token whose user no longer exists", async () => {
    const registration = await registerUser();
    const token = registration.body.data.token as string;
    await User.deleteMany({});

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out an authenticated user", async () => {
    const registration = await registerUser();
    const token = registration.body.data.token as string;

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Logout successful" });
  });

  it("rejects an unauthenticated logout with 401", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(401);
  });
});

describe("API misc", () => {
  it("responds to the health check", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 for unknown routes in the standard envelope", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
