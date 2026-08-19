import { z } from "zod";
import { EnrollmentStatus } from "../models/enrollment.model";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const statusSchema = z.enum(EnrollmentStatus, {
  error: "status must be active, completed, or cancelled",
});

const paginationFields = {
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(10),
  search: z.string().trim().max(100).optional(),
  status: statusSchema.optional(),
  sortBy: z.enum(["enrolledAt", "lastAccessedAt", "status"]).default("enrolledAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
};

export const myCoursesQuerySchema = z.object(paginationFields);

export const courseEnrollmentsQuerySchema = z.object(paginationFields);

export const allEnrollmentsQuerySchema = z.object({
  ...paginationFields,
  course: z
    .string()
    .regex(OBJECT_ID_PATTERN, "course must be a valid course id")
    .optional(),
});

export type EnrollmentListQuery = z.infer<typeof myCoursesQuerySchema>;
export type AllEnrollmentsQuery = z.infer<typeof allEnrollmentsQuerySchema>;
