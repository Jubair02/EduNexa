import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  createUserSchema,
  listUsersQuerySchema,
  statusSchema,
  updateUserSchema,
} from "../validators/users.validators";

const router = Router();

// Every user-management endpoint is admin-only.
router.use(authenticate, authorize(UserRole.ADMIN));

// Static paths must be registered before "/:id".
router.get("/statistics", usersController.getStatistics);
router.get("/recent", usersController.getRecentUsers);

router.get("/", validateQuery(listUsersQuerySchema), usersController.listUsers);
router.post("/", validate(createUserSchema), usersController.createUser);

router.get("/:id", usersController.getUser);
router.put("/:id", validate(updateUserSchema), usersController.updateUser);
router.patch("/:id/status", validate(statusSchema), usersController.setUserStatus);
router.delete("/:id", usersController.deleteUser);

export default router;
