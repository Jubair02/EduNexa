import { Request, Response } from "express";
import { CourseStatus } from "../models/course.model";
import * as coursesService from "../services/courses.service";
import { Viewer } from "../services/courses.service";
import { ApiError } from "../utils/ApiError";
import { ListCoursesQuery } from "../validators/courses.validators";

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

export const listCourses = async (req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as ListCoursesQuery;
  const { courses, pagination } = await coursesService.listCourses(query, viewerOrNull(req));
  res.status(200).json({
    success: true,
    message: "Courses retrieved",
    data: courses,
    pagination,
  });
};

export const getCourse = async (req: Request, res: Response): Promise<void> => {
  const course = await coursesService.getCourse(param(req, "idOrSlug"), viewerOrNull(req));
  res.status(200).json({ success: true, message: "Course retrieved", data: { course } });
};

export const createCourse = async (req: Request, res: Response): Promise<void> => {
  const course = await coursesService.createCourse(req.body, requireViewer(req));
  res.status(201).json({ success: true, message: "Course created", data: { course } });
};

export const updateCourse = async (req: Request, res: Response): Promise<void> => {
  const course = await coursesService.updateCourse(
    param(req, "id"),
    req.body,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Course updated", data: { course } });
};

export const setCourseStatus = async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status: CourseStatus };
  const course = await coursesService.setCourseStatus(
    param(req, "id"),
    status,
    requireViewer(req)
  );
  const messages: Record<CourseStatus, string> = {
    [CourseStatus.PUBLISHED]: "Course published",
    [CourseStatus.ARCHIVED]: "Course archived",
    [CourseStatus.DRAFT]: "Course moved to draft",
  };
  res.status(200).json({ success: true, message: messages[status], data: { course } });
};

export const deleteCourse = async (req: Request, res: Response): Promise<void> => {
  await coursesService.deleteCourse(param(req, "id"), requireViewer(req));
  res.status(200).json({ success: true, message: "Course deleted" });
};

export const getStatistics = async (req: Request, res: Response): Promise<void> => {
  const statistics = await coursesService.getStatistics(requireViewer(req));
  res.status(200).json({
    success: true,
    message: "Course statistics retrieved",
    data: statistics,
  });
};
