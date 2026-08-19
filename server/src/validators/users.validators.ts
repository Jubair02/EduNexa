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
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
