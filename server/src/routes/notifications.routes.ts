import { Router } from "express";
import * as notificationsController from "../controllers/notifications.controller";
import { authenticate } from "../middleware/auth.middleware";

/** Mounted at /notifications. Every role has a feed; the contents differ. */
const router = Router();

router.get("/", authenticate, notificationsController.getNotifications);
router.post("/seen", authenticate, notificationsController.markSeen);

export default router;
