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

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
