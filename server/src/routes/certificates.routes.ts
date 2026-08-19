import { Router } from "express";
import * as certificatesController from "../controllers/certificates.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import {
  certificateListQuerySchema,
  certificateStatusSchema,
} from "../validators/certificates.validators";

/** Mounted at /certificates. */
export const certificatesRouter = Router();

// Public verification first: it must not be shadowed by "/:id", and it is the
// only certificate route without authentication.
certificatesRouter.get(
  "/verify/:verificationCode",
  certificatesController.verifyCertificate
);

// Students see their own; admins see all. Instructors are rejected by the
// service — they get completion statistics instead.
certificatesRouter.get(
  "/",
  authenticate,
  validateQuery(certificateListQuerySchema),
  certificatesController.listCertificates
);
certificatesRouter.get("/:id", authenticate, certificatesController.getCertificate);
certificatesRouter.get(
  "/:id/download",
  authenticate,
  certificatesController.downloadCertificate
);
certificatesRouter.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.ADMIN),
  validate(certificateStatusSchema),
  certificatesController.setCertificateStatus
);

/** Mounted at /courses/:courseId. */
export const courseCompletionRouter = Router({ mergeParams: true });

courseCompletionRouter.get(
  "/completion-statistics",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  certificatesController.courseCompletionStatistics
);
