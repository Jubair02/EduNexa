import { Request, Response } from "express";
import { Types } from "mongoose";
import { checkAndCompleteCourse } from "../services/course-completion.service";
import { Viewer } from "../services/courses.service";
import * as progressService from "../services/progress.service";
import { ApiError } from "../utils/ApiError";

const requireViewer = (req: Request): Viewer => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return { id: req.user._id.toString(), role: req.user.role };
};

// Express 5 types route params as string | string[].
const param = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

/**
 * Records the lesson state, then lets the completion service decide whether the
 * course is now finished. Completion is never taken from the request.
 */
const applyLessonProgress = async (req: Request, isCompleted: boolean) => {
  const viewer = requireViewer(req);
  const { progress, courseId } = await progressService.setLessonProgress(
    param(req, "lessonId"),
    { isCompleted },
    viewer
  );
  const outcome = await checkAndCompleteCourse(viewer.id, courseId);

  return {
    progress,
    courseProgress: outcome.progress,
    certificate: outcome.certificate,
    newlyCompleted: outcome.newlyCompleted,
  };
};

export const completeLesson = async (req: Request, res: Response): Promise<void> => {
  const data = await applyLessonProgress(req, true);
  res.status(200).json({ success: true, message: "Lesson marked complete", data });
};

export const setLessonProgress = async (req: Request, res: Response): Promise<void> => {
  const { isCompleted } = req.body as { isCompleted: boolean };
  const data = await applyLessonProgress(req, isCompleted);
  res.status(200).json({
    success: true,
    message: isCompleted ? "Lesson marked complete" : "Lesson marked incomplete",
    data,
  });
};

export const getLessonProgress = async (req: Request, res: Response): Promise<void> => {
  const progress = await progressService.getLessonProgress(
    param(req, "lessonId"),
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Lesson progress retrieved",
    data: { progress },
  });
};

export const getCourseProgress = async (req: Request, res: Response): Promise<void> => {
  const viewer = requireViewer(req);
  let progress = await progressService.getCourseProgressFor(
    param(req, "courseId"),
    viewer
  );

  // Reading is normally side-effect free, but if the requirements are already
  // satisfied and nothing has recorded that yet (content finished before this
  // feature existed, or an interrupted request), reconcile it now. The
  // operation is idempotent and never moves an existing completion date.
  if (progress.isCompleted && !progress.certificateAvailable) {
    progress = (
      await checkAndCompleteCourse(viewer.id, new Types.ObjectId(progress.courseId))
    ).progress;
  }

  res.status(200).json({
    success: true,
    message: "Course progress retrieved",
    data: { progress },
  });
};

export const getMyCoursesProgress = async (req: Request, res: Response): Promise<void> => {
  const data = await progressService.listMyCoursesProgress(requireViewer(req));
  res.status(200).json({ success: true, message: "Progress retrieved", data });
};
