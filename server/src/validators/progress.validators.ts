import { z } from "zod";

export const lessonProgressSchema = z.object({
  isCompleted: z.boolean({ error: "isCompleted must be true or false" }),
});

export type LessonProgressInput = z.infer<typeof lessonProgressSchema>;

/**
 * Pagination for the student's own course list. The summary always covers the
 * whole account; only the rows are paged.
 */
export const myCoursesProgressQuerySchema = z.object({
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(20),
});

export type MyCoursesProgressQuery = z.infer<typeof myCoursesProgressQuerySchema>;
