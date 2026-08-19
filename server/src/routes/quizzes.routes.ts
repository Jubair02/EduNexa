import { Router } from "express";
import * as quizzesController from "../controllers/quizzes.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import { publishStatusSchema } from "../validators/modules.validators";
import {
  attemptsQuerySchema,
  createQuizSchema,
  submitQuizSchema,
  updateQuizSchema,
} from "../validators/quizzes.validators";

const staffOnly = [authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR)];
const studentOnly = [authenticate, authorize(UserRole.STUDENT)];

/** Mounted at /courses/:courseId/quizzes. */
export const courseQuizzesRouter = Router({ mergeParams: true });

// Students see published quizzes of courses they're enrolled in; staff see all
// of their own. The service decides which serialization to return.
courseQuizzesRouter.get("/", authenticate, quizzesController.listCourseQuizzes);
courseQuizzesRouter.post(
  "/",
  ...staffOnly,
  validate(createQuizSchema),
  quizzesController.createQuiz
);

/** Mounted at /quizzes. */
export const quizzesRouter = Router();

// Static path before "/:id" so it isn't swallowed by the id route.
quizzesRouter.get("/my-quizzes", ...studentOnly, quizzesController.listMyQuizzes);

quizzesRouter.get("/:id", authenticate, quizzesController.getQuiz);
quizzesRouter.put(
  "/:id",
  ...staffOnly,
  validate(updateQuizSchema),
  quizzesController.updateQuiz
);
quizzesRouter.delete("/:id", ...staffOnly, quizzesController.deleteQuiz);
quizzesRouter.patch(
  "/:id/status",
  ...staffOnly,
  validate(publishStatusSchema),
  quizzesController.setQuizStatus
);

quizzesRouter.post(
  "/:id/submit",
  ...studentOnly,
  validate(submitQuizSchema),
  quizzesController.submitQuiz
);
quizzesRouter.get("/:id/my-results", ...studentOnly, quizzesController.getMyResults);
quizzesRouter.get(
  "/:id/results",
  ...staffOnly,
  validateQuery(attemptsQuerySchema),
  quizzesController.getQuizResults
);

/** Mounted at /quiz-attempts. */
export const quizAttemptsRouter = Router();

quizAttemptsRouter.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validateQuery(attemptsQuerySchema),
  quizzesController.listAllAttempts
);
