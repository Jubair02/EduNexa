import { z } from "zod";
import { LessonType } from "../models/lesson.model";

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

const typeSchema = z.enum(LessonType, {
  error: "Type must be video, text, pdf, or document",
});

const contentSchema = z
  .string()
  .trim()
  .max(50000, "Content cannot exceed 50000 characters")
  .optional();

const urlSchema = (label: string) =>
  z
    .union([z.url({ error: `${label} must be a valid URL` }), z.literal("")], {
      error: `${label} must be a valid URL`,
    })
    .optional();

const durationSchema = z
  .number({ error: "Duration must be a number of minutes" })
  .int("Duration must be whole minutes")
  .positive("Duration must be a positive number of minutes")
  .max(100000, "Duration is unreasonably long")
  .nullable()
  .optional();

const lessonFields = {
  title: titleSchema,
  description: descriptionSchema,
  type: typeSchema,
  content: contentSchema,
  videoUrl: urlSchema("Video URL"),
  fileUrl: urlSchema("File URL"),
  fileName: z.string().trim().max(255, "File name is too long").optional(),
  filePublicId: z.string().trim().max(300, "File public id is too long").optional(),
  duration: durationSchema,
  isPreview: z.boolean({ error: "isPreview must be true or false" }).optional(),
};

// Type-specific requirements (video → videoUrl, text → content, pdf/document
// → fileUrl) are enforced in the service layer, where they also apply to
// partial updates against the lesson's effective state.

export const createLessonSchema = z.object(lessonFields);

export const updateLessonSchema = z
  .object({
    ...lessonFields,
    title: titleSchema.optional(),
    type: typeSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export const reorderLessonsSchema = z.object({
  lessonIds: z
    .array(z.string().regex(OBJECT_ID_PATTERN, "Each lesson id must be valid"), {
      error: "lessonIds must be an array of lesson ids",
    })
    .min(1, "lessonIds cannot be empty")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "lessonIds cannot contain duplicates",
    }),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
