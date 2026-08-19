import { Router } from "express";
import * as coursesController from "../controllers/courses.controller";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  courseStatusSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from "../validators/courses.validators";

const router = Router();

const staffOnly = [authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR)];

// Static paths before "/:idOrSlug".
router.get("/statistics", ...staffOnly, coursesController.getStatistics);

// Listing and details are public for the catalog; the service scopes what
// each viewer may actually see (manage view requires admin/instructor).
router.get(
  "/",
  optionalAuthenticate,
  validateQuery(listCoursesQuerySchema),
  coursesController.listCourses
);
router.get("/:idOrSlug", optionalAuthenticate, coursesController.getCourse);

router.post("/", ...staffOnly, validate(createCourseSchema), coursesController.createCourse);
router.put("/:id", ...staffOnly, validate(updateCourseSchema), coursesController.updateCourse);
router.patch(
  "/:id/status",
  ...staffOnly,
  validate(courseStatusSchema),
  coursesController.setCourseStatus
);
router.delete("/:id", ...staffOnly, coursesController.deleteCourse);

export default router;
