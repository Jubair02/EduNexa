import { Request, Response } from "express";
import { Viewer } from "../services/courses.service";
import * as lessonsService from "../services/lessons.service";
import { ApiError } from "../utils/ApiError";

const viewerOrNull = (req: Request): Viewer | null =>
  req.user ? { id: req.user._id.toString(), role: req.user.role } : null;

const requireViewer = (req: Request): Viewer => {
  const viewer = viewerOrNull(req);
  if (!viewer) {
    throw ApiError.unauthorized();
  }
  return viewer;
};

// Express 5 types route params as string | string[].
const param = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

export const listLessons = async (req: Request, res: Response): Promise<void> => {
  const lessons = await lessonsService.listLessons(
    param(req, "moduleId"),
    viewerOrNull(req)
  );
  res.status(200).json({ success: true, message: "Lessons retrieved", data: lessons });
};

export const getLesson = async (req: Request, res: Response): Promise<void> => {
  const result = await lessonsService.getLesson(param(req, "id"), viewerOrNull(req));
  res.status(200).json({ success: true, message: "Lesson retrieved", data: result });
};

export const createLesson = async (req: Request, res: Response): Promise<void> => {
  const lesson = await lessonsService.createLesson(
    param(req, "moduleId"),
    req.body,
    requireViewer(req)
  );
  res.status(201).json({ success: true, message: "Lesson created", data: { lesson } });
};

export const updateLesson = async (req: Request, res: Response): Promise<void> => {
  const lesson = await lessonsService.updateLesson(
    param(req, "id"),
    req.body,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Lesson updated", data: { lesson } });
};

export const deleteLesson = async (req: Request, res: Response): Promise<void> => {
  await lessonsService.deleteLesson(param(req, "id"), requireViewer(req));
  res.status(200).json({ success: true, message: "Lesson deleted" });
};

export const setLessonStatus = async (req: Request, res: Response): Promise<void> => {
  const { isPublished } = req.body as { isPublished: boolean };
  const lesson = await lessonsService.setLessonStatus(
    param(req, "id"),
    isPublished,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: isPublished ? "Lesson published" : "Lesson unpublished",
    data: { lesson },
  });
};

export const reorderLessons = async (req: Request, res: Response): Promise<void> => {
  const { lessonIds } = req.body as { lessonIds: string[] };
  const lessons = await lessonsService.reorderLessons(
    param(req, "moduleId"),
    lessonIds,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Lessons reordered", data: lessons });
};
