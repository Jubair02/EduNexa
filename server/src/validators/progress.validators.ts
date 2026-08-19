import { z } from "zod";

export const lessonProgressSchema = z.object({
  isCompleted: z.boolean({ error: "isCompleted must be true or false" }),
});

export type LessonProgressInput = z.infer<typeof lessonProgressSchema>;
