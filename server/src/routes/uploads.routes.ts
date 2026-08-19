import { Router } from "express";
import multer from "multer";
import * as uploadsController from "../controllers/uploads.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { UserRole } from "../models/user.model";

// Files are buffered in memory and streamed straight to Cloudinary — nothing
// is written to disk or MongoDB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  upload.single("file"),
  uploadsController.uploadFile
);

export default router;
