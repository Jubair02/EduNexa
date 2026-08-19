import { Request, Response } from "express";
import { checkAndCompleteCourse } from "../services/course-completion.service";
import { Viewer } from "../services/courses.service";
import * as attemptsService from "../services/quiz-attempts.service";
import * as quizzesService from "../services/quizzes.service";
import { ApiError } from "../utils/ApiError";
import { AttemptsQuery } from "../validators/quizzes.validators";

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

export const listCourseQuizzes = async (req: Request, res: Response): Promise<void> => {
  const quizzes = await quizzesService.listCourseQuizzes(
    param(req, "courseId"),
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Quizzes retrieved", data: quizzes });
};

export const listMyQuizzes = async (req: Request, res: Response): Promise<void> => {
  const quizzes = await quizzesService.listMyQuizzes(requireViewer(req));
  res.status(200).json({ success: true, message: "Quizzes retrieved", data: quizzes });
};

export const getQuiz = async (req: Request, res: Response): Promise<void> => {
  const quiz = await quizzesService.getQuiz(param(req, "id"), requireViewer(req));
  res.status(200).json({ success: true, message: "Quiz retrieved", data: { quiz } });
};

export const createQuiz = async (req: Request, res: Response): Promise<void> => {
  const quiz = await quizzesService.createQuiz(
    param(req, "courseId"),
    req.body,
    requireViewer(req)
  );
  res.status(201).json({ success: true, message: "Quiz created", data: { quiz } });
};

export const updateQuiz = async (req: Request, res: Response): Promise<void> => {
  const quiz = await quizzesService.updateQuiz(
    param(req, "id"),
    req.body,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Quiz updated", data: { quiz } });
};

export const setQuizStatus = async (req: Request, res: Response): Promise<void> => {
  const { isPublished } = req.body as { isPublished: boolean };
  const quiz = await quizzesService.setQuizStatus(
    param(req, "id"),
    isPublished,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: isPublished ? "Quiz published" : "Quiz unpublished",
    data: { quiz },
  });
};

export const deleteQuiz = async (req: Request, res: Response): Promise<void> => {
  await quizzesService.deleteQuiz(param(req, "id"), requireViewer(req));
  res.status(200).json({ success: true, message: "Quiz deleted" });
};

export const submitQuiz = async (req: Request, res: Response): Promise<void> => {
  const viewer = requireViewer(req);
  const { result, courseId } = await attemptsService.submitAttempt(
    param(req, "id"),
    req.body,
    viewer
  );
  // Passing the last required quiz can complete the course and earn the
  // certificate; the completion service is the only place that decides.
  const outcome = await checkAndCompleteCourse(viewer.id, courseId);

  res.status(201).json({
    success: true,
    message: "Quiz submitted",
    data: {
      result,
      courseProgress: outcome.progress,
      certificate: outcome.certificate,
      newlyCompleted: outcome.newlyCompleted,
    },
  });
};

export const getMyResults = async (req: Request, res: Response): Promise<void> => {
  const results = await attemptsService.getMyResults(
    param(req, "id"),
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Results retrieved", data: results });
};

export const getQuizResults = async (req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as AttemptsQuery;
  const { attempts, pagination, summary } = await attemptsService.getQuizResults(
    param(req, "id"),
    query,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: "Quiz results retrieved",
    data: attempts,
    pagination,
    summary,
  });
};

export const listAllAttempts = async (_req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as AttemptsQuery;
  const { attempts, pagination } = await attemptsService.listAllAttempts(query);
  res.status(200).json({
    success: true,
    message: "Quiz attempts retrieved",
    data: attempts,
    pagination,
  });
};
