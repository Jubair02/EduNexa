import { Request, Response } from "express";
import * as lessonsService from "../services/lessons.service";
import { param, requireViewer, viewerOrNull } from "../utils/requestContext";

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

export const bulkSetLessonStatus = async (req: Request, res: Response): Promise<void> => {
  const { isPublished } = req.body as { isPublished: boolean };
  const result = await lessonsService.bulkSetLessonStatus(
    param(req, "moduleId"),
    req.body,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: `${result.affected} lesson${result.affected === 1 ? "" : "s"} ${
      isPublished ? "published" : "unpublished"
    }`,
    data: result,
  });
};
