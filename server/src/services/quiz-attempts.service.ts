/**
 * Quiz scoring lives entirely here. The client sends answers only; the score,
 * percentage and pass/fail are always recomputed from the stored answer key.
 */
import mongoose, { FilterQuery, Types } from "mongoose";
import { Course } from "../models/course.model";
import { QuestionType, Quiz, QuizDocument } from "../models/quiz.model";
import {
  IQuizAttempt,
  QuizAttempt,
  QuizAttemptDocument,
} from "../models/quiz-attempt.model";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { Viewer, canManageCourse } from "./courses.service";
import { loadStudentQuiz } from "./quizzes.service";
import { PaginationMeta } from "./users.service";
import { AttemptsQuery, SubmitQuizInput } from "../validators/quizzes.validators";

export interface AttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  submittedAt: Date;
}

export interface AttemptWithStudent extends AttemptResult {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface MyQuizResults {
  quizId: string;
  passingScore: number;
  attemptCount: number;
  bestPercentage: number | null;
  passed: boolean;
  attempts: AttemptResult[];
}

export interface QuizResultsSummary {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  totalAttempts: number;
  studentsAttempted: number;
  studentsPassed: number;
  averagePercentage: number | null;
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toResult = (attempt: QuizAttemptDocument, quizTitle: string): AttemptResult => ({
  attemptId: attempt._id.toString(),
  quizId: attempt.quiz.toString(),
  quizTitle,
  score: attempt.score,
  totalPoints: attempt.totalPoints,
  percentage: attempt.percentage,
  passed: attempt.passed,
  submittedAt: attempt.submittedAt,
});

const isPopulated = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !(value instanceof Types.ObjectId);

const toAttemptWithStudent = (attempt: QuizAttemptDocument): AttemptWithStudent => {
  const rawStudent = attempt.student as unknown;
  const rawQuiz = attempt.quiz as unknown;

  const student =
    isPopulated(rawStudent) && "email" in rawStudent
      ? (() => {
          const value = rawStudent as unknown as {
            _id: Types.ObjectId;
            firstName: string;
            lastName: string;
            email: string;
          };
          return {
            id: value._id.toString(),
            firstName: value.firstName,
            lastName: value.lastName,
            email: value.email,
          };
        })()
      : null;

  const quizTitle =
    isPopulated(rawQuiz) && "title" in rawQuiz
      ? String((rawQuiz as { title: string }).title)
      : "";
  const quizId = isPopulated(rawQuiz)
    ? String((rawQuiz as { _id: Types.ObjectId })._id)
    : attempt.quiz.toString();

  return {
    attemptId: attempt._id.toString(),
    quizId,
    quizTitle,
    score: attempt.score,
    totalPoints: attempt.totalPoints,
    percentage: attempt.percentage,
    passed: attempt.passed,
    submittedAt: attempt.submittedAt,
    student,
  };
};

/** Compares a submitted answer with the key; true-false is case-insensitive. */
const isCorrect = (
  question: QuizDocument["questions"][number],
  selectedAnswer: string | undefined
): boolean => {
  if (selectedAnswer === undefined) return false;
  if (question.type === QuestionType.TRUE_FALSE) {
    return selectedAnswer.trim().toLowerCase() === question.correctAnswer.toLowerCase();
  }
  return selectedAnswer === question.correctAnswer;
};

export const submitAttempt = async (
  quizId: string,
  input: SubmitQuizInput,
  viewer: Viewer
): Promise<{ result: AttemptResult; courseId: Types.ObjectId }> => {
  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("Only students can submit quiz attempts.");
  }

  const { quiz, course } = await loadStudentQuiz(quizId, viewer);

  const questionIds = new Set(quiz.questions.map((question) => question._id.toString()));
  for (const answer of input.answers) {
    if (!questionIds.has(answer.questionId)) {
      throw ApiError.badRequest("One or more answers reference an unknown question");
    }
  }

  const answerByQuestion = new Map(
    input.answers.map((answer) => [answer.questionId, answer.selectedAnswer])
  );

  let score = 0;
  let totalPoints = 0;
  for (const question of quiz.questions) {
    totalPoints += question.points;
    if (isCorrect(question, answerByQuestion.get(question._id.toString()))) {
      score += question.points;
    }
  }

  const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;

  const attempt = await QuizAttempt.create({
    quiz: quiz._id,
    course: course._id,
    student: viewer.id,
    answers: input.answers.map((answer) => ({
      questionId: new Types.ObjectId(answer.questionId),
      selectedAnswer: answer.selectedAnswer,
    })),
    score,
    totalPoints,
    percentage,
    passed: percentage >= quiz.passingScore,
    submittedAt: new Date(),
  });

  // Passing a required quiz can complete the course; the caller reconciles
  // that and supplies the resulting course progress.
  return { result: toResult(attempt, quiz.title), courseId: course._id };
};

/** A student's own attempt history for one quiz. */
export const getMyResults = async (
  quizId: string,
  viewer: Viewer
): Promise<MyQuizResults> => {
  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("Only students have personal quiz results.");
  }
  const { quiz } = await loadStudentQuiz(quizId, viewer);

  const attempts = await QuizAttempt.find({
    quiz: quiz._id,
    student: viewer.id,
  }).sort({ submittedAt: -1 });

  const percentages = attempts.map((attempt) => attempt.percentage);

  return {
    quizId: quiz._id.toString(),
    passingScore: quiz.passingScore,
    attemptCount: attempts.length,
    bestPercentage: percentages.length > 0 ? Math.max(...percentages) : null,
    passed: attempts.some((attempt) => attempt.passed),
    attempts: attempts.map((attempt) => toResult(attempt, quiz.title)),
  };
};

/** Every attempt on a quiz — admin, or the instructor who owns the course. */
export const getQuizResults = async (
  quizId: string,
  query: AttemptsQuery,
  viewer: Viewer
): Promise<{
  attempts: AttemptWithStudent[];
  pagination: PaginationMeta;
  summary: QuizResultsSummary;
}> => {
  if (!mongoose.isValidObjectId(quizId)) {
    throw ApiError.badRequest("Invalid quiz id");
  }
  const quiz = await Quiz.findById(quizId);
  if (!quiz) {
    throw ApiError.notFound("Quiz not found");
  }
  const course = await Course.findById(quiz.course);
  if (!course) {
    throw ApiError.notFound("Quiz not found");
  }
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only view results for your own courses.");
  }

  const filter: FilterQuery<IQuizAttempt> = { quiz: quiz._id };
  if (query.passed) {
    filter.passed = query.passed === "true";
  }

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const students = await User.find({
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    }).select("_id");
    filter.student = { $in: students.map((student) => student._id) };
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, attempts, allAttempts, distinctStudents, passedStudents] =
    await Promise.all([
      QuizAttempt.countDocuments(filter),
      QuizAttempt.find(filter)
        .sort({ [query.sortBy]: sortDirection, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate({ path: "student", select: "firstName lastName email" })
        .populate({ path: "quiz", select: "title" }),
      QuizAttempt.find({ quiz: quiz._id }).select("percentage"),
      QuizAttempt.distinct("student", { quiz: quiz._id }),
      QuizAttempt.distinct("student", { quiz: quiz._id, passed: true }),
    ]);

  const averagePercentage =
    allAttempts.length > 0
      ? Math.round(
          allAttempts.reduce((sum, attempt) => sum + attempt.percentage, 0) /
            allAttempts.length
        )
      : null;

  return {
    attempts: attempts.map(toAttemptWithStudent),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    summary: {
      quizId: quiz._id.toString(),
      quizTitle: quiz.title,
      passingScore: quiz.passingScore,
      totalAttempts: allAttempts.length,
      studentsAttempted: distinctStudents.length,
      studentsPassed: passedStudents.length,
      averagePercentage,
    },
  };
};

/** Platform-wide attempt log — admin only (enforced at the route). */
export const listAllAttempts = async (
  query: AttemptsQuery
): Promise<{ attempts: AttemptWithStudent[]; pagination: PaginationMeta }> => {
  const filter: FilterQuery<IQuizAttempt> = {};
  if (query.course) filter.course = query.course;
  if (query.quiz) filter.quiz = query.quiz;
  if (query.passed) filter.passed = query.passed === "true";

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const [students, quizzes] = await Promise.all([
      User.find({ $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] }).select(
        "_id"
      ),
      Quiz.find({ title: rx }).select("_id"),
    ]);
    filter.$or = [
      { student: { $in: students.map((student) => student._id) } },
      { quiz: { $in: quizzes.map((quiz) => quiz._id) } },
    ];
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, attempts] = await Promise.all([
    QuizAttempt.countDocuments(filter),
    QuizAttempt.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate({ path: "student", select: "firstName lastName email" })
      .populate({ path: "quiz", select: "title" }),
  ]);

  return {
    attempts: attempts.map(toAttemptWithStudent),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};
