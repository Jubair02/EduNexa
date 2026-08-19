import { z } from "zod";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const titleSchema = z
  .string({ error: "Title is required" })
  .trim()
  .min(3, "Title must be at least 3 characters")
  .max(120, "Title cannot exceed 120 characters");

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, "Description cannot exceed 1000 characters")
  .optional();

export const createModuleSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
});

export const updateModuleSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export const publishStatusSchema = z.object({
  isPublished: z.boolean({ error: "isPublished must be true or false" }),
});

export const reorderModulesSchema = z.object({
  moduleIds: z
    .array(z.string().regex(OBJECT_ID_PATTERN, "Each module id must be valid"), {
      error: "moduleIds must be an array of module ids",
    })
    .min(1, "moduleIds cannot be empty")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "moduleIds cannot contain duplicates",
    }),
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
