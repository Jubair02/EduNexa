/**
 * Self-service account management and the admin password-reset escape hatch.
 */
import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

let counter = 0;
const PASSWORD = "sufficiently-long-password";

const createUser = async (role: UserRole, isActive = true) => {
  counter += 1;
  const email = `acct-${role}-${counter}@example.com`;
  const user = await User.create({
    firstName: "Acc",
    lastName: `${role}${counter}`,
    email,
    password: PASSWORD,
    role,
    isActive,
  });
  return {
    user,
    email,
    token: signToken({ userId: user._id.toString(), role: user.role }),
  };
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const login = (email: string, password: string) =>
  request(app).post("/api/auth/login").send({ email, password });

describe("PATCH /api/auth/me", () => {
  it("updates the caller's own name and email", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me")
      .set(auth(student.token))
      .send({ firstName: "Renamed", lastName: "Person", email: "acct-new@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      firstName: "Renamed",
      lastName: "Person",
      email: "acct-new@example.com",
    });
    expect(JSON.stringify(res.body)).not.toContain("password");

    // The new email is what logs in now.
    expect((await login("acct-new@example.com", PASSWORD)).status).toBe(200);
    expect((await login(student.email, PASSWORD)).status).toBe(401);
  });

  it("accepts a partial update and leaves the rest alone", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me")
      .set(auth(student.token))
      .send({ firstName: "OnlyFirst" });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      firstName: "OnlyFirst",
      lastName: student.user.lastName,
      email: student.email,
    });
  });

  it("ignores role and isActive, so nobody can promote themselves", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me")
      .set(auth(student.token))
      .send({
        firstName: "Ambitious",
        role: "admin",
        isActive: false,
        _id: "000000000000000000000000",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("student");
    expect(res.body.data.user.isActive).toBe(true);

    const stored = await User.findById(student.user._id);
    expect(stored?.role).toBe(UserRole.STUDENT);
    expect(stored?.isActive).toBe(true);
  });

  it("refuses an email another account already uses", async () => {
    const first = await createUser(UserRole.STUDENT);
    const second = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me")
      .set(auth(second.token))
      .send({ email: first.email });

    expect(res.status).toBe(409);
    // The victim's account is untouched and still logs in.
    expect((await login(first.email, PASSWORD)).status).toBe(200);
  });

  it("accepts the caller's own email unchanged", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me")
      .set(auth(student.token))
      .send({ email: student.email });

    expect(res.status).toBe(200);
  });

  it("validates the payload and requires a session", async () => {
    const student = await createUser(UserRole.STUDENT);

    for (const body of [
      {},
      { firstName: "" },
      { email: "not-an-email" },
      { lastName: "x".repeat(51) },
    ]) {
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(student.token))
        .send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }

    expect((await request(app).patch("/api/auth/me").send({ firstName: "A" })).status).toBe(
      401
    );
  });

  it("works the same for every role", async () => {
    for (const role of [UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.STUDENT]) {
      const actor = await createUser(role);
      const res = await request(app)
        .patch("/api/auth/me")
        .set(auth(actor.token))
        .send({ firstName: "Updated" });
      expect(res.status, role).toBe(200);
      expect(res.body.data.user.role).toBe(role);
    }
  });
});

describe("PATCH /api/auth/me/password", () => {
  it("changes the password when the current one is correct", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me/password")
      .set(auth(student.token))
      .send({ currentPassword: PASSWORD, newPassword: "a-brand-new-password" });

    expect(res.status).toBe(200);
    expect((await login(student.email, "a-brand-new-password")).status).toBe(200);
    expect((await login(student.email, PASSWORD)).status).toBe(401);
  });

  it("stores a hash, never the plaintext", async () => {
    const student = await createUser(UserRole.STUDENT);

    await request(app)
      .patch("/api/auth/me/password")
      .set(auth(student.token))
      .send({ currentPassword: PASSWORD, newPassword: "another-new-password" });

    const stored = await User.findById(student.user._id).select("+password");
    expect(stored?.password).not.toBe("another-new-password");
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
  });

  it("refuses a wrong current password and leaves the old one working", async () => {
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me/password")
      .set(auth(student.token))
      .send({ currentPassword: "not-the-current-password", newPassword: "irrelevant-new" });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/current password/i);
    expect((await login(student.email, PASSWORD)).status).toBe(200);
    expect((await login(student.email, "irrelevant-new")).status).toBe(401);
  });

  it("refuses reusing the current password, a short one, and a missing session", async () => {
    const student = await createUser(UserRole.STUDENT);
    const url = "/api/auth/me/password";

    const same = await request(app)
      .patch(url)
      .set(auth(student.token))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
    expect(JSON.stringify(same.body)).toMatch(/different/i);

    for (const body of [
      { currentPassword: PASSWORD, newPassword: "short" },
      { currentPassword: PASSWORD },
      { newPassword: "a-valid-long-password" },
      {},
    ]) {
      const res = await request(app).patch(url).set(auth(student.token)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }

    expect(
      (
        await request(app)
          .patch(url)
          .send({ currentPassword: PASSWORD, newPassword: "a-valid-long-password" })
      ).status
    ).toBe(401);
  });

  it("cannot be aimed at another account", async () => {
    const victim = await createUser(UserRole.STUDENT);
    const attacker = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch("/api/auth/me/password")
      .set(auth(attacker.token))
      .send({
        currentPassword: PASSWORD,
        newPassword: "attacker-chosen-password",
        // There is no id in the path, and these are stripped by the schema.
        userId: victim.user._id.toString(),
        email: victim.email,
      });

    expect(res.status).toBe(200);
    // The victim's password is untouched; the attacker changed only their own.
    expect((await login(victim.email, PASSWORD)).status).toBe(200);
    expect((await login(victim.email, "attacker-chosen-password")).status).toBe(401);
    expect((await login(attacker.email, "attacker-chosen-password")).status).toBe(200);
  });
});

describe("PATCH /api/users/:id/password", () => {
  it("lets an admin restore access to a locked-out account", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);

    const res = await request(app)
      .patch(`/api/users/${student.user._id.toString()}/password`)
      .set(auth(admin.token))
      .send({ password: "admin-issued-password" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password reset");
    expect(JSON.stringify(res.body)).not.toContain("password");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");

    expect((await login(student.email, "admin-issued-password")).status).toBe(200);
    expect((await login(student.email, PASSWORD)).status).toBe(401);
  });

  it("does not require knowing the old password, and does not change anything else", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);

    await request(app)
      .patch(`/api/users/${student.user._id.toString()}/password`)
      .set(auth(admin.token))
      .send({ password: "fresh-admin-password" });

    const stored = await User.findById(student.user._id);
    expect(stored).toMatchObject({
      firstName: student.user.firstName,
      email: student.email,
      role: UserRole.STUDENT,
      isActive: true,
    });
  });

  it("is admin-only", async () => {
    const student = await createUser(UserRole.STUDENT);
    const instructor = await createUser(UserRole.INSTRUCTOR);
    const target = await createUser(UserRole.STUDENT);
    const url = `/api/users/${target.user._id.toString()}/password`;
    const body = { password: "hijacked-password-here" };

    for (const actor of [student, instructor]) {
      expect((await request(app).patch(url).set(auth(actor.token)).send(body)).status).toBe(
        403
      );
    }
    expect((await request(app).patch(url).send(body)).status).toBe(401);

    // Nothing changed: the original password still works.
    expect((await login(target.email, PASSWORD)).status).toBe(200);
  });

  it("validates the password and the target id", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT);
    const url = `/api/users/${student.user._id.toString()}/password`;

    for (const body of [{}, { password: "short" }, { password: "" }]) {
      expect((await request(app).patch(url).set(auth(admin.token)).send(body)).status).toBe(
        400
      );
    }

    const badId = await request(app)
      .patch("/api/users/not-an-id/password")
      .set(auth(admin.token))
      .send({ password: "a-valid-long-password" });
    expect(badId.status).toBe(400);

    const missing = await request(app)
      .patch("/api/users/000000000000000000000000/password")
      .set(auth(admin.token))
      .send({ password: "a-valid-long-password" });
    expect(missing.status).toBe(404);
  });

  it("still refuses login afterwards if the account is deactivated", async () => {
    const admin = await createUser(UserRole.ADMIN);
    const student = await createUser(UserRole.STUDENT, false);

    await request(app)
      .patch(`/api/users/${student.user._id.toString()}/password`)
      .set(auth(admin.token))
      .send({ password: "reset-but-still-disabled" });

    const res = await login(student.email, "reset-but-still-disabled");
    expect(res.status).toBe(403);
  });
});
