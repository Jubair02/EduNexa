import { Router } from "express";
import * as progressController from "../controllers/progress.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  lessonProgressSchema,
  myCoursesProgressQuerySchema,
} from "../validators/progress.validators";

// Progress belongs to a student; the service also re-checks the role.
const studentOnly = [authenticate, authorize(UserRole.STUDENT)];

/** Mounted at /lessons/:lessonId. */
export const lessonProgressRouter = Router({ mergeParams: true });

lessonProgressRouter.post(
  "/complete",
  ...studentOnly,
  progressController.completeLesson
);
lessonProgressRouter.patch(
  "/progress",
  ...studentOnly,
  validate(lessonProgressSchema),
  progressController.setLessonProgress
);
lessonProgressRouter.get("/progress", ...studentOnly, progressController.getLessonProgress);

/** Mounted at /courses/:courseId. */
export const courseProgressRouter = Router({ mergeParams: true });

courseProgressRouter.get("/progress", ...studentOnly, progressController.getCourseProgress);

/** Mounted at /progress. */
export const progressRouter = Router();

progressRouter.get(
  "/my-courses",
  ...studentOnly,
  validateQuery(myCoursesProgressQuerySchema),
  progressController.getMyCoursesProgress
);
