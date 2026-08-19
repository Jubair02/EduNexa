import { z } from "zod";
import { COURSE_CATEGORIES, CourseLevel, CourseStatus } from "../models/course.model";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const titleSchema = z
  .string({ error: "Title is required" })
  .trim()
  .min(3, "Title must be at least 3 characters")
  .max(120, "Title cannot exceed 120 characters");

const descriptionSchema = z
  .string({ error: "Description is required" })
  .trim()
  .min(10, "Description must be at least 10 characters")
  .max(5000, "Description cannot exceed 5000 characters");

const shortDescriptionSchema = z
  .string()
  .trim()
  .max(300, "Short description cannot exceed 300 characters")
  .optional();

const categorySchema = z.enum(COURSE_CATEGORIES, {
  error: "Category must be one of the supported categories",
});

const levelSchema = z.enum(CourseLevel, {
  error: "Level must be beginner, intermediate, or advanced",
});

const statusSchema = z.enum(CourseStatus, {
  error: "Status must be draft, published, or archived",
});

const durationSchema = z
  .number({ error: "Duration must be a number of minutes" })
  .int("Duration must be whole minutes")
  .positive("Duration must be a positive number of minutes")
  .max(100000, "Duration is unreasonably long")
  .nullable()
  .optional();

const instructorIdSchema = z
  .string({ error: "Instructor must be a user id" })
  .regex(OBJECT_ID_PATTERN, "Instructor must be a valid user id");

// A URL sets the thumbnail; an empty string clears it.
const thumbnailSchema = z
  .union([z.url({ error: "Thumbnail must be a valid URL" }), z.literal("")], {
    error: "Thumbnail must be a valid URL",
  })
  .optional();

const thumbnailPublicIdSchema = z
  .string()
  .trim()
  .max(300, "Thumbnail public id is too long")
  .optional();

export const createCourseSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  shortDescription: shortDescriptionSchema,
  category: categorySchema,
  level: levelSchema,
  duration: durationSchema,
  instructor: instructorIdSchema.optional(),
  thumbnail: thumbnailSchema,
  thumbnailPublicId: thumbnailPublicIdSchema,
});

export const updateCourseSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    shortDescription: shortDescriptionSchema,
    category: categorySchema.optional(),
    level: levelSchema.optional(),
    duration: durationSchema,
    instructor: instructorIdSchema.optional(),
    thumbnail: thumbnailSchema,
    thumbnailPublicId: thumbnailPublicIdSchema,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export const courseStatusSchema = z.object({
  status: statusSchema,
});

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(10),
  search: z.string().trim().max(100).optional(),
  category: categorySchema.optional(),
  level: levelSchema.optional(),
  status: statusSchema.optional(),
  instructor: z
    .string()
    .regex(OBJECT_ID_PATTERN, "instructor must be a valid user id")
    .optional(),
  sortBy: z
    .enum(["createdAt", "title", "category", "level", "status"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  /**
   * catalog (default): published courses only — safe for anyone.
   * manage: admin sees everything, instructors see their own courses.
   */
  view: z.enum(["catalog", "manage"]).default("catalog"),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
