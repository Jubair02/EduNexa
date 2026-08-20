import { z } from "zod";

export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Please provide a valid email address" }));

export const firstNameSchema = z
  .string({ error: "First name is required" })
  .trim()
  .min(1, "First name is required")
  .max(50, "First name cannot exceed 50 characters");

export const lastNameSchema = z
  .string({ error: "Last name is required" })
  .trim()
  .min(1, "Last name is required")
  .max(50, "Last name cannot exceed 50 characters");

export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password cannot exceed 128 characters");

export const registerSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
});

/**
 * Self-service profile edit. Deliberately limited to name and email — `role`
 * and `isActive` are absent, so a user cannot promote or reactivate themselves
 * by posting extra fields (Zod strips what it does not declare).
 */
export const updateProfileSchema = z
  .object({
    firstName: firstNameSchema.optional(),
    lastName: lastNameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

/**
 * Self-service password change. The current password is required so a stolen
 * token alone cannot lock the real owner out of their account.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Your current password is required" })
      .min(1, "Your current password is required"),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "Your new password must be different from the current one",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
