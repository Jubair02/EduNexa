import { Router } from "express";
import * as modulesController from "../controllers/modules.controller";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  createModuleSchema,
  publishStatusSchema,
  reorderModulesSchema,
  updateModuleSchema,
} from "../validators/modules.validators";

const staffOnly = [authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR)];

/** Mounted at /courses/:courseId/modules — mergeParams exposes courseId. */
export const courseModulesRouter = Router({ mergeParams: true });

courseModulesRouter.get("/", optionalAuthenticate, modulesController.listModules);
courseModulesRouter.post(
  "/",
  ...staffOnly,
  validate(createModuleSchema),
  modulesController.createModule
);
courseModulesRouter.patch(
  "/reorder",
  ...staffOnly,
  validate(reorderModulesSchema),
  modulesController.reorderModules
);

/** Mounted at /modules. */
export const modulesRouter = Router();

modulesRouter.get("/:id", optionalAuthenticate, modulesController.getModule);
modulesRouter.put(
  "/:id",
  ...staffOnly,
  validate(updateModuleSchema),
  modulesController.updateModule
);
modulesRouter.delete("/:id", ...staffOnly, modulesController.deleteModule);
modulesRouter.patch(
  "/:id/status",
  ...staffOnly,
  validate(publishStatusSchema),
  modulesController.setModuleStatus
);
