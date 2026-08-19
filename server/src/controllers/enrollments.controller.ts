import { Request, Response } from "express";
import { Viewer } from "../services/courses.service";
import * as enrollmentsService from "../services/enrollments.service";
import { ApiError } from "../utils/ApiError";
import {
  AllEnrollmentsQuery,
  EnrollmentListQuery,
} from "../validators/enrollments.validators";

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

export const enroll = async (req: Request, res: Response): Promise<void> => {
  const enrollment = await enrollmentsService.enroll(
    param(req, "courseId"),
    requireViewer(req)
  );
  res.status(201).json({
    success: true,
    message: "Successfully enrolled in course",
    data: { enrollment },
  });
};

export const listMyCourses = async (req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as EnrollmentListQuery;
  const { enrollments, pagination } = await enrollmentsService.listMyCourses(
    query,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Enrolled courses retrieved",
    data: enrollments,
    pagination,
  });
};

export const getEnrollment = async (req: Request, res: Response): Promise<void> => {
  const enrollment = await enrollmentsService.getEnrollment(
    param(req, "id"),
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Enrollment retrieved",
    data: { enrollment },
  });
};

export const checkEnrollment = async (req: Request, res: Response): Promise<void> => {
  const result = await enrollmentsService.checkEnrollment(
    param(req, "courseId"),
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Enrollment status retrieved",
    data: result,
  });
};

export const cancelEnrollment = async (req: Request, res: Response): Promise<void> => {
  const enrollment = await enrollmentsService.cancelEnrollment(
    param(req, "id"),
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Enrollment cancelled",
    data: { enrollment },
  });
};

export const listCourseEnrollments = async (
  req: Request,
  res: Response
): Promise<void> => {
  const query = res.locals.query as EnrollmentListQuery;
  const { enrollments, pagination } = await enrollmentsService.listCourseEnrollments(
    param(req, "courseId"),
    query,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Course enrollments retrieved",
    data: enrollments,
    pagination,
  });
};

export const listAllEnrollments = async (_req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as AllEnrollmentsQuery;
  const { enrollments, pagination } = await enrollmentsService.listAllEnrollments(query);
  res.status(200).json({
    success: true,
    message: "Enrollments retrieved",
    data: enrollments,
    pagination,
  });
};

export const getStatistics = async (_req: Request, res: Response): Promise<void> => {
  const statistics = await enrollmentsService.getStatistics();
  res.status(200).json({
    success: true,
    message: "Enrollment statistics retrieved",
    data: statistics,
  });
};
