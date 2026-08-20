import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { Certificate } from "../src/models/certificate.model";
import { AuditAction, AuditLog, AuditTargetType } from "../src/models/audit-log.model";
import { Course } from "../src/models/course.model";
import { Enrollment } from "../src/models/enrollment.model";
import { User, UserRole } from "../src/models/user.model";
import { signToken } from "../src/utils/jwt";

/** The entry shape the API returns, as the tests read it. */
interface LoggedEntry {
  action: string;
  summary: string;
  actor: { id: string | null; name: string; email: string; role: string };
  target: { type: string; id: string | null; label: string };
  changes: { field: string; from: string; to: string }[];
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: string;
}

let sequence = 0;

const makeUser = async (role: UserRole, overrides: Record<string, unknown> = {}) => {
  sequence += 1;
  const user = await User.create({
    firstName: "Base",
    lastName: role,
    email: `${role}-${sequence}@example.com`,
    password: "sufficiently-long-password",
    role,
    ...overrides,
  });
  return { user, token: signToken({ userId: user._id.toString(), role: user.role }) };
};

describe("audit log authorization", () => {
  it("rejects unauthenticated access with 401", async () => {
    const res = await request(app).get("/api/audit-logs");
    expect(res.status).toBe(401);
  });

  it.each([[UserRole.STUDENT], [UserRole.INSTRUCTOR]])(
    "rejects %s access with 403",
    async (role) => {
      const { token } = await makeUser(role);
      const res = await request(app)
        .get("/api/audit-logs")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  );

  it("allows admins to read the log", async () => {
    const { token } = await makeUser(UserRole.ADMIN);
    const res = await request(app)
      .get("/api/audit-logs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("exposes no way to write, edit or delete an entry", async () => {
    const { token } = await makeUser(UserRole.ADMIN);
    const auth = `Bearer ${token}`;

    const post = await request(app).post("/api/audit-logs").set("Authorization", auth);
    const del = await request(app).delete("/api/audit-logs").set("Authorization", auth);

    expect(post.status).toBe(404);
    expect(del.status).toBe(404);
  });
});

describe("audit entries are append-only", () => {
  it("refuses to save a modified entry", async () => {
    const { user } = await makeUser(UserRole.ADMIN);
    const entry = await AuditLog.create({
      action: AuditAction.USER_DELETED,
      actor: user._id,
      actorName: "Base admin",
      actorEmail: user.email,
      actorRole: UserRole.ADMIN,
      targetType: AuditTargetType.USER,
      summary: "Deleted something",
    });

    entry.summary = "Deleted nothing, actually";
    await expect(entry.save()).rejects.toThrow(/append-only/i);
  });
});

describe("recording admin actions", () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let auth: string;

  beforeEach(async () => {
    admin = await makeUser(UserRole.ADMIN, {
      firstName: "Ada",
      lastName: "Admin",
      email: "ada.admin@example.com",
    });
    auth = `Bearer ${admin.token}`;
  });

  const logs = async (qs = "") => {
    const res = await request(app)
      .get(`/api/audit-logs${qs}`)
      .set("Authorization", auth);
    expect(res.status).toBe(200);
    return res.body.data as LoggedEntry[];
  };

  it("records a role change with the before and after values", async () => {
    const { user } = await makeUser(UserRole.STUDENT, {
      firstName: "Sam",
      lastName: "Student",
      email: "sam@example.com",
    });

    await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", auth)
      .send({ role: UserRole.INSTRUCTOR })
      .expect(200);

    const [entry] = await logs();
    expect(entry).toMatchObject({
      action: AuditAction.USER_ROLE_CHANGED,
      actor: { name: "Ada Admin", email: "ada.admin@example.com", role: UserRole.ADMIN },
      target: { type: AuditTargetType.USER, label: "Sam Student (sam@example.com)" },
      changes: [{ field: "role", from: "student", to: "instructor" }],
    });
    expect(entry.summary).toContain("student to instructor");
  });

  it("labels a non-role edit as an update and lists every field that moved", async () => {
    const { user } = await makeUser(UserRole.STUDENT, { email: "before@example.com" });

    await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", auth)
      .send({ firstName: "Renamed", email: "after@example.com" })
      .expect(200);

    const [entry] = await logs();
    expect(entry.action).toBe(AuditAction.USER_UPDATED);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { field: "email", from: "before@example.com", to: "after@example.com" },
        { field: "firstName", from: "Base", to: "Renamed" },
      ])
    );
  });

  it("records nothing when an update changes no values", async () => {
    const { user } = await makeUser(UserRole.STUDENT, { firstName: "Same" });

    await request(app)
      .put(`/api/users/${user._id.toString()}`)
      .set("Authorization", auth)
      .send({ firstName: "Same" })
      .expect(200);

    expect(await logs()).toEqual([]);
  });

  it("records a password reset without storing the password in any form", async () => {
    const { user } = await makeUser(UserRole.STUDENT);
    const secret = "a-brand-new-password-123";

    await request(app)
      .patch(`/api/users/${user._id.toString()}/password`)
      .set("Authorization", auth)
      .send({ password: secret })
      .expect(200);

    const [entry] = await logs();
    expect(entry.action).toBe(AuditAction.USER_PASSWORD_RESET);
    expect(entry.changes).toEqual([]);
    expect(JSON.stringify(entry)).not.toContain(secret);

    // Nor anywhere in the stored document.
    const stored = await AuditLog.findOne({
      action: AuditAction.USER_PASSWORD_RESET,
    }).lean();
    expect(JSON.stringify(stored)).not.toContain(secret);
  });

  it("records a deactivation as a status change", async () => {
    const { user } = await makeUser(UserRole.STUDENT);

    await request(app)
      .patch(`/api/users/${user._id.toString()}/status`)
      .set("Authorization", auth)
      .send({ isActive: false })
      .expect(200);

    const [entry] = await logs();
    expect(entry).toMatchObject({
      action: AuditAction.USER_STATUS_CHANGED,
      changes: [{ field: "isActive", from: "true", to: "false" }],
    });
  });

  it("keeps what a deleted account was, since the reference no longer resolves", async () => {
    const { user } = await makeUser(UserRole.INSTRUCTOR, {
      firstName: "Gone",
      lastName: "Forever",
      email: "gone@example.com",
    });

    await request(app)
      .delete(`/api/users/${user._id.toString()}`)
      .set("Authorization", auth)
      .expect(200);

    const [entry] = await logs();
    expect(entry).toMatchObject({
      action: AuditAction.USER_DELETED,
      target: { id: user._id.toString(), label: "Gone Forever (gone@example.com)" },
      metadata: { role: "instructor", wasActive: true },
    });
    expect(await User.findById(user._id)).toBeNull();
  });

  it("names every account removed by a bulk delete", async () => {
    const one = await makeUser(UserRole.STUDENT, {
      firstName: "One",
      lastName: "Student",
      email: "one@example.com",
    });
    const two = await makeUser(UserRole.STUDENT, {
      firstName: "Two",
      lastName: "Student",
      email: "two@example.com",
    });

    await request(app)
      .post("/api/users/bulk-delete")
      .set("Authorization", auth)
      .send({ userIds: [one.user._id.toString(), two.user._id.toString()] })
      .expect(200);

    const [entry] = await logs();
    expect(entry.action).toBe(AuditAction.USERS_BULK_DELETED);
    expect(entry.metadata).toMatchObject({ requested: 2, affected: 2 });
    expect(entry.metadata.accounts).toEqual(
      expect.arrayContaining([
        "One Student (one@example.com) — student",
        "Two Student (two@example.com) — student",
      ])
    );
  });

  it("records a bulk status change without inventing a single before value", async () => {
    const one = await makeUser(UserRole.STUDENT);
    const two = await makeUser(UserRole.STUDENT, { isActive: false });

    await request(app)
      .patch("/api/users/bulk-status")
      .set("Authorization", auth)
      .send({
        userIds: [one.user._id.toString(), two.user._id.toString()],
        isActive: false,
      })
      .expect(200);

    const [entry] = await logs();
    expect(entry.action).toBe(AuditAction.USERS_BULK_STATUS_CHANGED);
    expect(entry.changes).toEqual([]);
    expect(entry.metadata).toMatchObject({ isActive: false, requested: 2, affected: 2 });
  });

  it("stays readable after the acting admin is deleted", async () => {
    const target = await makeUser(UserRole.STUDENT);
    const culprit = await makeUser(UserRole.ADMIN, {
      firstName: "Mal",
      lastName: "Feasance",
      email: "mal@example.com",
    });

    await request(app)
      .delete(`/api/users/${target.user._id.toString()}`)
      .set("Authorization", `Bearer ${culprit.token}`)
      .expect(200);

    // The admin who acted then leaves. The snapshot is the entire reason the
    // entry can still say who it was.
    await User.findByIdAndDelete(culprit.user._id);

    const [entry] = await logs();
    expect(entry.actor).toMatchObject({
      id: culprit.user._id.toString(),
      name: "Mal Feasance",
      email: "mal@example.com",
      role: UserRole.ADMIN,
    });
  });

  it("records the certificate that was revoked", async () => {
    // Built directly rather than earned through a full course journey: what is
    // under test is the entry, not how a certificate comes to exist.
    const { user } = await makeUser(UserRole.STUDENT);
    const course = await Course.create({
      title: "Auditing 101",
      slug: "auditing-101",
      description: "A course about keeping records.",
      category: "programming",
      level: "beginner",
      instructor: user._id,
      status: "published",
    });
    const enrollment = await Enrollment.create({ student: user._id, course: course._id });
    const certificate = await Certificate.create({
      certificateNumber: "LMS-2026-000042",
      verificationCode: "verification-code-under-test",
      student: user._id,
      course: course._id,
      enrollment: enrollment._id,
      completionDate: new Date(),
      studentName: "Base student",
      courseTitle: "Auditing 101",
      instructorName: "Base instructor",
    });

    await request(app)
      .patch(`/api/certificates/${certificate._id.toString()}/status`)
      .set("Authorization", auth)
      .send({ status: "revoked" })
      .expect(200);

    const [entry] = await logs();
    expect(entry).toMatchObject({
      action: AuditAction.CERTIFICATE_STATUS_CHANGED,
      target: { type: AuditTargetType.CERTIFICATE, label: "LMS-2026-000042" },
      changes: [{ field: "status", from: "active", to: "revoked" }],
    });
    // The code that proves a certificate genuine is not audit material.
    expect(JSON.stringify(entry)).not.toContain("verification-code-under-test");
  });
});

describe("filtering the log", () => {
  let auth: string;

  beforeEach(async () => {
    const admin = await makeUser(UserRole.ADMIN, { email: "filter-admin@example.com" });
    auth = `Bearer ${admin.token}`;

    const student = await makeUser(UserRole.STUDENT, {
      firstName: "Filter",
      lastName: "Target",
      email: "filter.target@example.com",
    });

    await request(app)
      .put(`/api/users/${student.user._id.toString()}`)
      .set("Authorization", auth)
      .send({ role: UserRole.INSTRUCTOR })
      .expect(200);

    await request(app)
      .patch(`/api/users/${student.user._id.toString()}/password`)
      .set("Authorization", auth)
      .send({ password: "another-long-enough-password" })
      .expect(200);
  });

  const get = (qs: string) =>
    request(app).get(`/api/audit-logs${qs}`).set("Authorization", auth);

  it("returns newest first with pagination metadata", async () => {
    const res = await get("?limit=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(res.body.data[0].action).toBe(AuditAction.USER_PASSWORD_RESET);
  });

  it("narrows by action", async () => {
    const res = await get(`?action=${AuditAction.USER_ROLE_CHANGED}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe(AuditAction.USER_ROLE_CHANGED);
  });

  it("rejects an unknown action rather than ignoring the filter", async () => {
    const res = await get("?action=user.exploded");
    expect(res.status).toBe(400);
  });

  it("searches the actor, the target and the summary", async () => {
    expect((await get("?search=filter.target")).body.data).toHaveLength(2);
    expect((await get("?search=filter-admin")).body.data).toHaveLength(2);
    expect((await get("?search=nobody-by-that-name")).body.data).toHaveLength(0);
  });

  it("treats a date-only end of range as the whole of that day", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await get(`?from=${today}&to=${today}`);
    expect(res.body.data).toHaveLength(2);
  });

  it("rejects a range that ends before it starts", async () => {
    const res = await get("?from=2026-08-20&to=2026-08-01");
    expect(res.status).toBe(400);
  });
});
