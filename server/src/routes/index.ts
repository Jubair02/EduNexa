import { Router } from "express";
import auditRoutes from "./audit.routes";
import authRoutes from "./auth.routes";
import {
  certificatesRouter,
  courseCompletionRouter,
} from "./certificates.routes";
import coursesRoutes from "./courses.routes";
import { courseEnrollmentRouter, enrollmentsRouter } from "./enrollments.routes";
import { lessonsRouter, moduleLessonsRouter } from "./lessons.routes";
import { courseModulesRouter, modulesRouter } from "./modules.routes";
import {
  courseProgressRouter,
  lessonProgressRouter,
  progressRouter,
} from "./progress.routes";
import {
  courseQuizzesRouter,
  quizAttemptsRouter,
  quizzesRouter,
} from "./quizzes.routes";
import notificationsRoutes from "./notifications.routes";
import teachingRoutes from "./teaching.routes";
import uploadsRoutes from "./uploads.routes";
import usersRoutes from "./users.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "OK" });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/audit-logs", auditRoutes);
// Nested content routes are mounted before their parent resources so the
// more specific paths match first.
router.use("/courses/:courseId/modules", courseModulesRouter);
router.use("/courses/:courseId/quizzes", courseQuizzesRouter);
router.use("/courses/:courseId", courseEnrollmentRouter);
router.use("/courses/:courseId", courseProgressRouter);
router.use("/courses/:courseId", courseCompletionRouter);
router.use("/modules/:moduleId/lessons", moduleLessonsRouter);
router.use("/modules", modulesRouter);
router.use("/lessons/:lessonId", lessonProgressRouter);
router.use("/lessons", lessonsRouter);
router.use("/enrollments", enrollmentsRouter);
router.use("/progress", progressRouter);
router.use("/quizzes", quizzesRouter);
router.use("/quiz-attempts", quizAttemptsRouter);
router.use("/certificates", certificatesRouter);
router.use("/courses", coursesRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/teaching", teachingRoutes);
router.use("/uploads", uploadsRoutes);

export default router;
