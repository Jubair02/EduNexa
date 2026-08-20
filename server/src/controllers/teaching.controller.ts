import { Request, Response } from "express";
import * as teachingService from "../services/teaching.service";
import { requireViewer } from "../utils/requestContext";
import { TeachingStudentsQuery } from "../validators/enrollments.validators";

export const getTeachingOverview = async (req: Request, res: Response): Promise<void> => {
  const overview = await teachingService.getTeachingOverview(requireViewer(req));
  res.status(200).json({
    success: true,
    message: "Teaching overview retrieved",
    data: overview,
  });
};

export const getTeachingStudents = async (req: Request, res: Response): Promise<void> => {
  const { students, pagination } = await teachingService.getTeachingStudents(
    requireViewer(req),
    res.locals.query as TeachingStudentsQuery
  );
  res.status(200).json({
    success: true,
    message: "Students retrieved",
    data: students,
    pagination,
  });
};
