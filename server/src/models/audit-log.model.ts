import { HydratedDocument, Model, Schema, Types, model } from "mongoose";
import { UserRole } from "./user.model";

/**
 * What happened.
 *
 * These strings are persisted on every record and are what the admin screen
 * filters on, so renaming one rewrites history — add a new value instead.
 */
export enum AuditAction {
  USER_CREATED = "user.created",
  USER_UPDATED = "user.updated",
  USER_ROLE_CHANGED = "user.role_changed",
  USER_STATUS_CHANGED = "user.status_changed",
  USER_PASSWORD_RESET = "user.password_reset",
  USER_DELETED = "user.deleted",
  USERS_BULK_STATUS_CHANGED = "users.bulk_status_changed",
  USERS_BULK_DELETED = "users.bulk_deleted",
  CERTIFICATE_STATUS_CHANGED = "certificate.status_changed",
  COURSE_DELETED = "course.deleted",
}

/** What the action was performed on. `USERS` is the bulk counterpart of `USER`. */
export enum AuditTargetType {
  USER = "user",
  USERS = "users",
  COURSE = "course",
  CERTIFICATE = "certificate",
}

/** One field that moved, rendered as "role: student → instructor". */
export interface IAuditChange {
  field: string;
  from: string;
  to: string;
}

export interface IAuditLog {
  action: AuditAction;
  /**
   * The account that acted. Kept as a reference for filtering, but every
   * displayed value below is a snapshot: an audit trail whose entries become
   * unreadable once an account is deleted is not an audit trail, and deleting
   * accounts is one of the things it exists to record.
   */
  actor: Types.ObjectId | null;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  targetType: AuditTargetType;
  /** Null for bulk actions, which have many targets rather than one. */
  target: Types.ObjectId | null;
  /** Snapshot label, for the same reason the actor's name is one. */
  targetLabel: string;
  /** Human-readable one-liner, composed at write time. */
  summary: string;
  changes: IAuditChange[];
  /** Action-specific extras — bulk counts, deleted-account labels. */
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;
type AuditLogModel = Model<IAuditLog>;

const changeSchema = new Schema<IAuditChange>(
  {
    field: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
  },
  { _id: false }
);

const auditLogSchema = new Schema<IAuditLog, AuditLogModel>(
  {
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, required: true, trim: true },
    actorEmail: { type: String, required: true, trim: true },
    actorRole: { type: String, enum: Object.values(UserRole), required: true },
    targetType: {
      type: String,
      enum: Object.values(AuditTargetType),
      required: true,
    },
    target: { type: Schema.Types.ObjectId, default: null },
    targetLabel: { type: String, default: "", trim: true },
    summary: { type: String, required: true, trim: true },
    changes: { type: [changeSchema], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  // Written once, never revised — so there is no updatedAt to keep.
  { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Append-only, enforced rather than merely documented. Nothing in the app edits
 * an entry, and this makes a future attempt to fail loudly instead of quietly
 * rewriting the record of what someone did.
 */
auditLogSchema.pre("save", function (next) {
  if (!this.isNew) {
    next(new Error("Audit log entries are append-only and cannot be modified."));
    return;
  }
  next();
});

// The log is read newest-first, optionally narrowed by action, actor or target.
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ target: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog, AuditLogModel>("AuditLog", auditLogSchema);
