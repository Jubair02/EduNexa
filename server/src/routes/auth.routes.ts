import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { accountLimiter, authLimiter } from "../middleware/rate-limit.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "../validators/auth.validators";

const router = Router();

// Credential endpoints are rate limited: these are the two doors an attacker
// can knock on without already holding a token.
router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);

// Self-service account management. Both act on the authenticated user only —
// there is no id in the path, so neither can reach another account.
router.patch(
  "/me",
  authenticate,
  validate(updateProfileSchema),
  authController.updateProfile
);
router.patch(
  "/me/password",
  authenticate,
  accountLimiter,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
