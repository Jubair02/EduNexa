import { Router } from "express";
import * as auditController from "../controllers/audit.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateQuery } from "../middleware/validate.middleware";
import { UserRole } from "../models/user.model";
import { listAuditLogsQuerySchema } from "../validators/audit.validators";

const router = Router();

/**
 * Reading the log is admin-only, and reading is all anyone can do: there is no
 * write, edit or delete route here on purpose. Entries are appended by the
 * services that perform the audited action.
 */
router.use(authenticate, authorize(UserRole.ADMIN));

router.get("/", validateQuery(listAuditLogsQuerySchema), auditController.listAuditLogs);

export default router;
