import { z } from "zod";
import { UserRole } from "../models/user.model";
import {
  emailSchema,
  firstNameSchema,
  lastNameSchema,
  passwordSchema,
} from "./auth.validators";

const roleSchema = z.enum(UserRole, {
  error: "Role must be one of: admin, instructor, student",
});

export const createUserSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

export const updateUserSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean({ error: "isActive must be true or false" }).optional(),
    // Deliberately no password field: editing a user never touches their
    // password, so it can never be overwritten with an empty value.
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export const statusSchema = z.object({
  isActive: z.boolean({ error: "isActive must be true or false" }),
});

/**
 * Admin-issued password reset — the escape hatch for a locked-out account.
 * Separate from `updateUserSchema` on purpose: a password change should be a
 * deliberate, single-purpose request, never a field that rides along with an
 * ordinary profile edit and gets set by accident.
 */
export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

/**
 * Bulk operations. Capped so one request cannot be turned into an unbounded
 * write, and de-duplicated so a repeated id is not counted twice.
 */
const userIdsSchema = z
  .array(
    z.string().regex(/^[0-9a-fA-F]{24}$/, "Each id must be a valid user id"),
    { error: "userIds must be an array of user ids" }
  )
  .min(1, "Select at least one user")
  .max(100, "Select at most 100 users at a time")
  .transform((ids) => [...new Set(ids)]);

export const bulkStatusSchema = z.object({
  userIds: userIdsSchema,
  isActive: z.boolean({ error: "isActive must be true or false" }),
});

export const bulkDeleteSchema = z.object({
  userIds: userIdsSchema,
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(10),
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(["active", "inactive"], { error: "status must be active or inactive" }).optional(),
  sortBy: z
    .enum(["createdAt", "firstName", "lastName", "email", "role"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
