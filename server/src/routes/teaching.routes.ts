import { Router } from "express";
import * as teachingController from "../controllers/teaching.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import { teachingStudentsQuerySchema } from "../validators/enrollments.validators";

/** Mounted at /teaching. */
const router = Router();

// Instructors get their own courses; admins get the platform. The service
// scopes the data, the guard keeps students out entirely.
router.get(
  "/overview",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  teachingController.getTeachingOverview
);

router.get(
  "/students",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  validateQuery(teachingStudentsQuerySchema),
  teachingController.getTeachingStudents
);

export default router;
