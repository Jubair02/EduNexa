import { Router } from "express";
import * as lessonsController from "../controllers/lessons.controller";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  createLessonSchema,
  reorderLessonsSchema,
  updateLessonSchema,
} from "../validators/lessons.validators";
import { publishStatusSchema } from "../validators/modules.validators";

const staffOnly = [authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR)];

/** Mounted at /modules/:moduleId/lessons — mergeParams exposes moduleId. */
export const moduleLessonsRouter = Router({ mergeParams: true });

moduleLessonsRouter.get("/", optionalAuthenticate, lessonsController.listLessons);
moduleLessonsRouter.post(
  "/",
  ...staffOnly,
  validate(createLessonSchema),
  lessonsController.createLesson
);
moduleLessonsRouter.patch(
  "/reorder",
  ...staffOnly,
  validate(reorderLessonsSchema),
  lessonsController.reorderLessons
);

/** Mounted at /lessons. */
export const lessonsRouter = Router();

lessonsRouter.get("/:id", optionalAuthenticate, lessonsController.getLesson);
lessonsRouter.put(
  "/:id",
  ...staffOnly,
  validate(updateLessonSchema),
  lessonsController.updateLesson
);
lessonsRouter.delete("/:id", ...staffOnly, lessonsController.deleteLesson);
lessonsRouter.patch(
  "/:id/status",
  ...staffOnly,
  validate(publishStatusSchema),
  lessonsController.setLessonStatus
);
