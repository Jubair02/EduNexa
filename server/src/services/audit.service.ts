import mongoose, { FilterQuery } from "mongoose";
import {
  AuditAction,
  AuditLog,
  AuditTargetType,
  IAuditChange,
  IAuditLog,
} from "../models/audit-log.model";
import { UserRole } from "../models/user.model";
import { escapeRegex } from "../utils/escapeRegex";
import { describeError, logger } from "../utils/logger";
import type { ListAuditLogsQuery } from "../validators/audit.validators";
import type { Viewer } from "./courses.service";
import type { PaginationMeta } from "./users.service";

/**
 * Who performed an action, with enough identity to survive their own deletion.
 *
 * Structurally a `Viewer`, so anything that already authorizes against one
 * accepts an actor unchanged.
 */
export interface AuditActor extends Viewer {
  name: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

/** "Jane Doe (jane@example.com)" — the label every entry is read by. */
export const describeUser = (user: {
  firstName: string;
  lastName: string;
  email: string;
}): string => `${user.firstName} ${user.lastName} (${user.email})`;

interface RecordAuditInput {
  action: AuditAction;
  actor: AuditActor;
  targetType: AuditTargetType;
  targetId?: string | mongoose.Types.ObjectId | null;
  targetLabel?: string;
  summary: string;
  changes?: IAuditChange[];
  metadata?: Record<string, unknown>;
}

/** A header value may legally be an array; keep the log field a plain string. */
const MAX_USER_AGENT = 400;

/**
 * Appends one entry.
 *
 * Deliberately swallows its own failures. The action being recorded has already
 * happened and been committed by the time this runs, so throwing here would
 * turn a successful role change into a 500 and invite the admin to repeat it —
 * trading a missing log line for a duplicated action. A failed write is
 * therefore reported to the operational log and nowhere else.
 *
 * This is the right trade for a classroom LMS. A system with a regulatory
 * requirement to prove the log is complete would need the opposite: the audit
 * write inside the same transaction as the change, so neither can happen alone.
 */
export const recordAudit = async (input: RecordAuditInput): Promise<void> => {
  try {
    await AuditLog.create({
      action: input.action,
      actor: mongoose.isValidObjectId(input.actor.id) ? input.actor.id : null,
      actorName: input.actor.name,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      targetType: input.targetType,
      target:
        input.targetId && mongoose.isValidObjectId(input.targetId)
          ? input.targetId
          : null,
      targetLabel: input.targetLabel ?? "",
      summary: input.summary,
      changes: input.changes ?? [],
      metadata: input.metadata ?? {},
      ip: input.actor.ip ?? "",
      userAgent: (input.actor.userAgent ?? "").slice(0, MAX_USER_AGENT),
    });

    // Also emitted to the operational log so someone tailing output sees
    // sensitive actions as they happen, without querying the collection.
    logger.info(`audit.${input.action}`, {
      actorId: input.actor.id,
      targetId: input.targetId ? String(input.targetId) : undefined,
    });
  } catch (error) {
    logger.error("audit.write_failed", {
      action: input.action,
      actorId: input.actor.id,
      ...describeError(error),
    });
  }
};

/** Records a boolean flip as a readable change row. */
export const booleanChange = (
  field: string,
  from: boolean,
  to: boolean
): IAuditChange => ({ field, from: String(from), to: String(to) });

export interface SafeAuditLog {
  id: string;
  action: AuditAction;
  summary: string;
  actor: {
    /** Null once the account is gone; the name and email still resolve. */
    id: string | null;
    name: string;
    email: string;
    role: UserRole;
  };
  target: {
    type: AuditTargetType;
    id: string | null;
    label: string;
  };
  changes: IAuditChange[];
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: Date;
}

const toSafeAuditLog = (log: IAuditLog & { _id: mongoose.Types.ObjectId }): SafeAuditLog => ({
  id: log._id.toString(),
  action: log.action,
  summary: log.summary,
  actor: {
    id: log.actor ? log.actor.toString() : null,
    name: log.actorName,
    email: log.actorEmail,
    role: log.actorRole,
  },
  target: {
    type: log.targetType,
    id: log.target ? log.target.toString() : null,
    label: log.targetLabel,
  },
  changes: log.changes,
  metadata: log.metadata,
  ip: log.ip,
  userAgent: log.userAgent,
  createdAt: log.createdAt,
});

const buildListFilter = (query: ListAuditLogsQuery): FilterQuery<IAuditLog> => {
  const filter: FilterQuery<IAuditLog> = {};

  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.actorId) filter.actor = query.actorId;
  if (query.targetId) filter.target = query.targetId;

  if (query.from || query.to) {
    // `to` is inclusive of the whole day the admin picked: a date-only value
    // parses to midnight, which would otherwise exclude everything on it.
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (query.from) createdAt.$gte = query.from;
    if (query.to) createdAt.$lte = endOfDay(query.to);
    filter.createdAt = createdAt;
  }

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { actorName: rx },
      { actorEmail: rx },
      { targetLabel: rx },
      { summary: rx },
    ];
  }

  return filter;
};

/** Midnight-valued dates mean "that whole day", not "that instant". */
const endOfDay = (date: Date): Date => {
  const isMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  if (!isMidnight) return date;

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

export const listAuditLogs = async (
  query: ListAuditLogsQuery
): Promise<{ logs: SafeAuditLog[]; pagination: PaginationMeta }> => {
  const filter = buildListFilter(query);

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      // _id breaks ties so entries written in the same millisecond keep a
      // stable order across pages.
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<(IAuditLog & { _id: mongoose.Types.ObjectId })[]>(),
  ]);

  return {
    logs: logs.map(toSafeAuditLog),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};
