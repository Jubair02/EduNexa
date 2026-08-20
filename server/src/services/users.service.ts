import mongoose, { FilterQuery } from "mongoose";
import {
  AuditAction,
  AuditTargetType,
  IAuditChange,
} from "../models/audit-log.model";
import { IUser, User, UserDocument, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import {
  AuditActor,
  booleanChange,
  describeUser,
  recordAudit,
} from "./audit.service";
import { SafeUser, sanitizeUser } from "../utils/sanitizeUser";
import {
  BulkDeleteInput,
  BulkStatusInput,
  CreateUserInput,
  ListUsersQuery,
  ResetPasswordInput,
  UpdateUserInput,
} from "../validators/users.validators";
import { escapeRegex } from "../utils/escapeRegex";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserStatistics {
  totalUsers: number;
  students: number;
  instructors: number;
  admins: number;
  activeUsers: number;
  inactiveUsers: number;
}

const findUserOrThrow = async (id: string): Promise<UserDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid user id");
  }
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return user;
};

const buildListFilter = (query: ListUsersQuery): FilterQuery<IUser> => {
  const filter: FilterQuery<IUser> = {};

  if (query.role) {
    filter.role = query.role;
  }
  if (query.status) {
    filter.isActive = query.status === "active";
  }

  const search = query.search?.trim();
  if (search) {
    const words = search.split(/\s+/).map(escapeRegex);
    if (words.length === 1) {
      const rx = new RegExp(words[0], "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    } else {
      // Multi-word search: every word must match a name part ("john doe"),
      // or the whole string matches the email.
      filter.$or = [
        {
          $and: words.map((word) => {
            const rx = new RegExp(word, "i");
            return { $or: [{ firstName: rx }, { lastName: rx }] };
          }),
        },
        { email: new RegExp(escapeRegex(search), "i") },
      ];
    }
  }

  return filter;
};

export const listUsers = async (
  query: ListUsersQuery
): Promise<{ users: SafeUser[]; pagination: PaginationMeta }> => {
  const filter = buildListFilter(query);
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getUserById = async (id: string): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);
  return sanitizeUser(user);
};

export const createUser = async (
  input: CreateUserInput,
  actor: AuditActor
): Promise<SafeUser> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw ApiError.conflict("Email is already registered");
  }

  const user = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    password: input.password, // hashed by the model's pre-save hook
    role: input.role,
  });

  await recordAudit({
    action: AuditAction.USER_CREATED,
    actor,
    targetType: AuditTargetType.USER,
    targetId: user._id,
    targetLabel: describeUser(user),
    summary: `Created ${user.role} account ${describeUser(user)}`,
  });

  return sanitizeUser(user);
};

export const updateUser = async (
  id: string,
  input: UpdateUserInput,
  actor: AuditActor
): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);
  const isSelf = user._id.toString() === actor.id;

  if (isSelf && input.role !== undefined && input.role !== user.role) {
    throw ApiError.forbidden("You cannot change your own role.");
  }
  if (isSelf && input.isActive === false) {
    throw ApiError.forbidden("You cannot deactivate your own account.");
  }

  // Only fields that actually move are recorded, so submitting a form without
  // touching it does not produce an entry claiming something changed.
  const changes: IAuditChange[] = [];

  if (input.email !== undefined && input.email !== user.email) {
    const existing = await User.findOne({ email: input.email, _id: { $ne: user._id } });
    if (existing) {
      throw ApiError.conflict("Email is already registered");
    }
    changes.push({ field: "email", from: user.email, to: input.email });
    user.email = input.email;
  }

  if (input.firstName !== undefined && input.firstName !== user.firstName) {
    changes.push({ field: "firstName", from: user.firstName, to: input.firstName });
    user.firstName = input.firstName;
  }
  if (input.lastName !== undefined && input.lastName !== user.lastName) {
    changes.push({ field: "lastName", from: user.lastName, to: input.lastName });
    user.lastName = input.lastName;
  }
  if (input.role !== undefined && input.role !== user.role) {
    changes.push({ field: "role", from: user.role, to: input.role });
    user.role = input.role;
  }
  if (input.isActive !== undefined && input.isActive !== user.isActive) {
    changes.push(booleanChange("isActive", user.isActive, input.isActive));
    user.isActive = input.isActive;
  }

  await user.save();

  if (changes.length > 0) {
    const roleChange = changes.find((change) => change.field === "role");
    await recordAudit({
      /**
       * A role change is the headline whenever one is present — it is what an
       * admin scans and filters for, and burying it under a generic "updated"
       * would hide the most consequential edit this endpoint can make. The
       * complete change list is stored either way, so nothing is lost by
       * emitting one entry rather than two.
       */
      action: roleChange ? AuditAction.USER_ROLE_CHANGED : AuditAction.USER_UPDATED,
      actor,
      targetType: AuditTargetType.USER,
      targetId: user._id,
      targetLabel: describeUser(user),
      summary: roleChange
        ? `Changed ${describeUser(user)} from ${roleChange.from} to ${roleChange.to}`
        : `Updated ${changes.map((change) => change.field).join(", ")} for ${describeUser(user)}`,
      changes,
    });
  }

  return sanitizeUser(user);
};

export const setUserStatus = async (
  id: string,
  isActive: boolean,
  actor: AuditActor
): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);

  if (user._id.toString() === actor.id && !isActive) {
    throw ApiError.forbidden("You cannot deactivate your own account.");
  }

  const previous = user.isActive;
  user.isActive = isActive;
  await user.save();

  // Re-setting the state an account is already in is not a change to record.
  if (previous !== isActive) {
    await recordAudit({
      action: AuditAction.USER_STATUS_CHANGED,
      actor,
      targetType: AuditTargetType.USER,
      targetId: user._id,
      targetLabel: describeUser(user),
      summary: `${isActive ? "Activated" : "Deactivated"} ${describeUser(user)}`,
      changes: [booleanChange("isActive", previous, isActive)],
    });
  }

  return sanitizeUser(user);
};

export const deleteUser = async (id: string, actor: AuditActor): Promise<void> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid user id");
  }
  if (id === actor.id) {
    throw ApiError.forbidden("You cannot delete your own account.");
  }

  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) {
    throw ApiError.notFound("User not found");
  }

  await recordAudit({
    action: AuditAction.USER_DELETED,
    actor,
    targetType: AuditTargetType.USER,
    // The id is kept for correlation with earlier entries about this account,
    // but it no longer resolves to a row — so what the account *was* is copied
    // into the entry rather than left as a reference to nothing.
    targetId: deleted._id,
    targetLabel: describeUser(deleted),
    summary: `Deleted ${deleted.role} account ${describeUser(deleted)}`,
    metadata: { role: deleted.role, wasActive: deleted.isActive },
  });
};

export const getStatistics = async (): Promise<UserStatistics> => {
  const [totalUsers, students, instructors, admins, activeUsers, inactiveUsers] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: UserRole.STUDENT }),
      User.countDocuments({ role: UserRole.INSTRUCTOR }),
      User.countDocuments({ role: UserRole.ADMIN }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
    ]);

  return { totalUsers, students, instructors, admins, activeUsers, inactiveUsers };
};

export const getRecentUsers = async (limit = 6): Promise<SafeUser[]> => {
  const users = await User.find().sort({ createdAt: -1, _id: -1 }).limit(limit);
  return users.map(sanitizeUser);
};

/**
 * Admin-issued password reset. This is the recovery path for a locked-out
 * account: without it, a forgotten password can only be fixed in the database.
 *
 * Sessions are stateless, so any token the user already holds keeps working
 * until it expires — the reset restores access, it does not evict existing
 * sessions.
 */
export const resetUserPassword = async (
  id: string,
  input: ResetPasswordInput,
  actor: AuditActor
): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);

  // Assigning triggers the model's pre-save hook, which does the hashing — the
  // plaintext never reaches the database and is never logged.
  user.password = input.password;
  await user.save();

  await recordAudit({
    action: AuditAction.USER_PASSWORD_RESET,
    actor,
    targetType: AuditTargetType.USER,
    targetId: user._id,
    targetLabel: describeUser(user),
    summary: `Reset the password for ${describeUser(user)}`,
    // No `changes` rows on purpose. That one account set another's credential
    // is exactly what needs recording; neither the old nor the new password is
    // written here in any form, hashed or otherwise.
  });

  return sanitizeUser(user);
};

/**
 * What a bulk write did — the client shows this back to the admin.
 *
 * `affected` counts the accounts that existed and are now in the requested
 * state. It is deliberately not "how many values changed": mongoose stamps
 * `updatedAt` on every matched document, so a driver-reported modified count
 * would equal the matched count anyway. The useful signal in the gap between
 * `requested` and `affected` is ids that no longer exist.
 */
export interface BulkResult {
  requested: number;
  affected: number;
}

/**
 * Activates or deactivates several accounts at once.
 *
 * The caller cannot be in the batch when deactivating: locking yourself out is
 * never the intent, and silently skipping your own id would make the reported
 * count a lie. The request is refused so the admin can correct the selection.
 */
export const bulkSetUserStatus = async (
  input: BulkStatusInput,
  actor: AuditActor
): Promise<BulkResult> => {
  if (!input.isActive && input.userIds.includes(actor.id)) {
    throw ApiError.badRequest("You cannot deactivate your own account.");
  }

  const result = await User.updateMany(
    { _id: { $in: input.userIds } },
    { isActive: input.isActive }
  );

  await recordAudit({
    action: AuditAction.USERS_BULK_STATUS_CHANGED,
    actor,
    targetType: AuditTargetType.USERS,
    targetLabel: `${result.matchedCount} account${result.matchedCount === 1 ? "" : "s"}`,
    summary: `${input.isActive ? "Activated" : "Deactivated"} ${result.matchedCount} account${
      result.matchedCount === 1 ? "" : "s"
    }`,
    /**
     * No `changes` rows: a batch starts from a mix of states, so a single
     * from → to pair would be a guess presented as a fact. The resulting state
     * is in the summary, and the ids are here — these accounts still exist, so
     * their current values can always be looked up.
     */
    metadata: {
      isActive: input.isActive,
      requested: input.userIds.length,
      affected: result.matchedCount,
      userIds: input.userIds,
    },
  });

  return { requested: input.userIds.length, affected: result.matchedCount };
};

/**
 * Deletes several accounts at once. As with the single-user route, the caller
 * cannot delete themselves, and asking to is refused rather than quietly
 * dropped from the batch.
 */
export const bulkDeleteUsers = async (
  input: BulkDeleteInput,
  actor: AuditActor
): Promise<BulkResult> => {
  if (input.userIds.includes(actor.id)) {
    throw ApiError.badRequest("You cannot delete your own account.");
  }

  /**
   * Read who is about to be removed while the rows still exist. Afterwards
   * there is no way to answer "which accounts were these?", and that is the one
   * question this entry has to be able to answer. The batch is capped at 100 by
   * the validator, so this is a single bounded read.
   */
  const removed = await User.find({ _id: { $in: input.userIds } })
    .select("firstName lastName email role")
    .lean();

  const result = await User.deleteMany({ _id: { $in: input.userIds } });

  await recordAudit({
    action: AuditAction.USERS_BULK_DELETED,
    actor,
    targetType: AuditTargetType.USERS,
    targetLabel: `${result.deletedCount} account${result.deletedCount === 1 ? "" : "s"}`,
    summary: `Deleted ${result.deletedCount} account${
      result.deletedCount === 1 ? "" : "s"
    }`,
    metadata: {
      requested: input.userIds.length,
      affected: result.deletedCount,
      accounts: removed.map((user) => `${describeUser(user)} — ${user.role}`),
    },
  });

  return { requested: input.userIds.length, affected: result.deletedCount };
};
