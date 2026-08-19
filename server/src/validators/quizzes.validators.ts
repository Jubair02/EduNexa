import { z } from "zod";
import { QuestionType } from "../models/quiz.model";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const TRUE_FALSE_OPTIONS = ["true", "false"];

const objectId = (label: string) =>
  z.string().regex(OBJECT_ID_PATTERN, `${label} must be a valid id`);

const titleSchema = z
  .string({ error: "Title is required" })
  .trim()
  .min(3, "Title must be at least 3 characters")
  .max(120, "Title cannot exceed 120 characters");

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, "Description cannot exceed 2000 characters")
  .optional();

/**
 * Question rules differ by type: multiple-choice needs distinct options with
 * the correct answer among them; true-false accepts only "true"/"false".
 * `order` is assigned from array position server-side, so it isn't accepted here.
 */
const questionSchema = z
  .object({
    questionText: z
      .string({ error: "Question text is required" })
      .trim()
      .min(3, "Question text must be at least 3 characters")
      .max(1000, "Question text cannot exceed 1000 characters"),
    type: z.enum(QuestionType, {
      error: "Question type must be multiple-choice or true-false",
    }),
    options: z.array(z.string().trim()).optional(),
    correctAnswer: z
      .string({ error: "A correct answer is required" })
      .trim()
      .min(1, "A correct answer is required"),
    points: z
      .number({ error: "Points must be a number" })
      .int("Points must be a whole number")
      .positive("Points must be positive")
      .max(1000, "Points are unreasonably high"),
  })
  .superRefine((question, ctx) => {
    if (question.type === QuestionType.TRUE_FALSE) {
      if (!TRUE_FALSE_OPTIONS.includes(question.correctAnswer.toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswer"],
          message: 'True/false answers must be "true" or "false"',
        });
      }
      return;
    }

    const options = (question.options ?? []).filter((option) => option.length > 0);
    if (options.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Multiple-choice questions need at least two options",
      });
      return;
    }
    if (options.length > 6) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Multiple-choice questions can have at most six options",
      });
    }
    if (new Set(options).size !== options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Options must be unique",
      });
    }
    if (!options.includes(question.correctAnswer)) {
      ctx.addIssue({
        code: "custom",
        path: ["correctAnswer"],
        message: "The correct answer must be one of the options",
      });
    }
  });

const questionsSchema = z
  .array(questionSchema, { error: "questions must be an array" })
  .min(1, "A quiz needs at least one question")
  .max(100, "A quiz cannot have more than 100 questions");

const passingScoreSchema = z
  .number({ error: "Passing score must be a number" })
  .int("Passing score must be a whole number")
  .min(0, "Passing score cannot be negative")
  .max(100, "Passing score cannot exceed 100");

// An empty string clears the module association.
const moduleSchema = z.union([objectId("Module"), z.literal("")]).optional();

export const createQuizSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  module: moduleSchema,
  passingScore: passingScoreSchema.default(70),
  isRequired: z.boolean({ error: "isRequired must be true or false" }).default(true),
  questions: questionsSchema,
});

export const updateQuizSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
    module: moduleSchema,
    passingScore: passingScoreSchema.optional(),
    isRequired: z.boolean({ error: "isRequired must be true or false" }).optional(),
    questions: questionsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export const submitQuizSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: objectId("questionId"),
        selectedAnswer: z
          .string({ error: "selectedAnswer is required" })
          .trim()
          .min(1, "selectedAnswer is required")
          .max(500, "selectedAnswer is too long"),
      }),
      { error: "answers must be an array" }
    )
    .min(1, "Answer at least one question")
    .refine(
      (answers) =>
        new Set(answers.map((answer) => answer.questionId)).size === answers.length,
      { message: "Each question can only be answered once" }
    ),
});

export const attemptsQuerySchema = z.object({
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(10),
  search: z.string().trim().max(100).optional(),
  course: objectId("course").optional(),
  quiz: objectId("quiz").optional(),
  passed: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["submittedAt", "percentage"]).default("submittedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type SubmitQuizInput = z.infer<typeof submitQuizSchema>;
export type AttemptsQuery = z.infer<typeof attemptsQuerySchema>;
