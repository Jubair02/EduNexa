import { Router } from "express";
import * as enrollmentsController from "../controllers/enrollments.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  allEnrollmentsQuerySchema,
  courseEnrollmentsQuerySchema,
  myCoursesQuerySchema,
} from "../validators/enrollments.validators";

/** Mounted at /courses/:courseId — enrollment actions scoped to one course. */
export const courseEnrollmentRouter = Router({ mergeParams: true });

courseEnrollmentRouter.post(
  "/enroll",
  authenticate,
  authorize(UserRole.STUDENT),
  enrollmentsController.enroll
);
courseEnrollmentRouter.get(
  "/enrollment",
  authenticate,
  authorize(UserRole.STUDENT),
  enrollmentsController.checkEnrollment
);
courseEnrollmentRouter.get(
  "/enrollments",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  validateQuery(courseEnrollmentsQuerySchema),
  enrollmentsController.listCourseEnrollments
);

/** Mounted at /enrollments. */
export const enrollmentsRouter = Router();

// Static paths before "/:id".
enrollmentsRouter.get(
  "/my-courses",
  authenticate,
  authorize(UserRole.STUDENT),
  validateQuery(myCoursesQuerySchema),
  enrollmentsController.listMyCourses
);
enrollmentsRouter.get(
  "/statistics",
  authenticate,
  authorize(UserRole.ADMIN),
  enrollmentsController.getStatistics
);
enrollmentsRouter.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validateQuery(allEnrollmentsQuerySchema),
  enrollmentsController.listAllEnrollments
);
enrollmentsRouter.get("/:id", authenticate, enrollmentsController.getEnrollment);
enrollmentsRouter.delete(
  "/:id",
  authenticate,
  authorize(UserRole.STUDENT, UserRole.ADMIN),
  enrollmentsController.cancelEnrollment
);
