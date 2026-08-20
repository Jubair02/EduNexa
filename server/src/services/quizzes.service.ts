import mongoose, { Types } from "mongoose";
import { Course, CourseDocument, CourseStatus } from "../models/course.model";
import { Enrollment, EnrollmentStatus } from "../models/enrollment.model";
import { Module } from "../models/module.model";
import { QuestionType, Quiz, QuizDocument } from "../models/quiz.model";
import { QuizAttempt } from "../models/quiz-attempt.model";
import { UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { findAccessibleEnrollment } from "./course-access.service";
import { Viewer, canManageCourse } from "./courses.service";
import { PaginationMeta } from "./users.service";
import {
  CreateQuizInput,
  MyQuizzesQuery,
  UpdateQuizInput,
} from "../validators/quizzes.validators";

const TRUE_FALSE_OPTIONS = ["true", "false"];

export interface StudentQuizQuestion {
  id: string;
  questionText: string;
  type: QuestionType;
  options: string[];
  points: number;
  order: number;
}

/** Author-facing question — includes the answer key. */
export interface ManageQuizQuestion extends StudentQuizQuestion {
  correctAnswer: string;
}

interface BaseQuiz {
  id: string;
  course: string;
  module: string | null;
  title: string;
  description?: string;
  passingScore: number;
  isRequired: boolean;
  isPublished: boolean;
  questionCount: number;
  totalPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManageQuiz extends BaseQuiz {
  questions: ManageQuizQuestion[];
}

export interface StudentQuiz extends BaseQuiz {
  questions: StudentQuizQuestion[];
}

const baseFields = (quiz: QuizDocument): BaseQuiz => ({
  id: quiz._id.toString(),
  course: quiz.course.toString(),
  module: quiz.module ? quiz.module.toString() : null,
  title: quiz.title,
  description: quiz.description || undefined,
  passingScore: quiz.passingScore,
  isRequired: quiz.isRequired,
  isPublished: quiz.isPublished,
  questionCount: quiz.questions.length,
  totalPoints: quiz.questions.reduce((sum, question) => sum + question.points, 0),
  createdAt: quiz.createdAt,
  updatedAt: quiz.updatedAt,
});

const toManageQuiz = (quiz: QuizDocument): ManageQuiz => ({
  ...baseFields(quiz),
  questions: quiz.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => ({
      id: question._id.toString(),
      questionText: question.questionText,
      type: question.type,
      options: [...question.options],
      correctAnswer: question.correctAnswer,
      points: question.points,
      order: question.order,
    })),
});

/** Serialization for students — `correctAnswer` is never included. */
const toStudentQuiz = (quiz: QuizDocument): StudentQuiz => ({
  ...baseFields(quiz),
  questions: quiz.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => ({
      id: question._id.toString(),
      questionText: question.questionText,
      type: question.type,
      options: [...question.options],
      points: question.points,
      order: question.order,
    })),
});

const findCourseOrThrow = async (courseId: string): Promise<CourseDocument> => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw ApiError.badRequest("Invalid course id");
  }
  const course = await Course.findById(courseId);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  return course;
};

const findQuizOrThrow = async (id: string): Promise<QuizDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid quiz id");
  }
  const quiz = await Quiz.findById(id);
  if (!quiz) {
    throw ApiError.notFound("Quiz not found");
  }
  return quiz;
};

/** A quiz may only be attached to a module of its own course. */
const resolveModule = async (
  moduleId: string,
  course: CourseDocument
): Promise<Types.ObjectId> => {
  const module = await Module.findById(moduleId);
  if (!module) {
    throw ApiError.badRequest("The selected module does not exist");
  }
  if (module.course.toString() !== course._id.toString()) {
    throw ApiError.badRequest("The module belongs to a different course");
  }
  return module._id;
};

/** Normalizes questions: true-false options are fixed, order follows position. */
const buildQuestions = (questions: CreateQuizInput["questions"]) =>
  questions.map((question, index) => {
    const isTrueFalse = question.type === QuestionType.TRUE_FALSE;
    return {
      questionText: question.questionText,
      type: question.type,
      options: isTrueFalse
        ? [...TRUE_FALSE_OPTIONS]
        : (question.options ?? []).filter((option) => option.length > 0),
      correctAnswer: isTrueFalse
        ? question.correctAnswer.toLowerCase()
        : question.correctAnswer,
      points: question.points,
      order: index + 1,
    };
  });

const assertCanManage = async (
  quiz: QuizDocument,
  viewer: Viewer
): Promise<CourseDocument> => {
  const course = await Course.findById(quiz.course);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage quizzes of your own courses.");
  }
  return course;
};

/**
 * Loads a quiz a student may take: published quiz, in a published module (when
 * set), of a published course they're actively enrolled in.
 */
export const loadStudentQuiz = async (
  quizId: string,
  viewer: Viewer
): Promise<{ quiz: QuizDocument; course: CourseDocument }> => {
  const quiz = await findQuizOrThrow(quizId);
  const course = await Course.findById(quiz.course);

  if (!course || course.status !== CourseStatus.PUBLISHED || !quiz.isPublished) {
    throw ApiError.notFound("Quiz not found");
  }
  if (quiz.module) {
    const module = await Module.findById(quiz.module);
    if (!module || !module.isPublished) {
      throw ApiError.notFound("Quiz not found");
    }
  }
  if (!(await findAccessibleEnrollment(viewer.id, course._id))) {
    throw ApiError.forbidden("You need an active enrollment to take this quiz.");
  }

  return { quiz, course };
};

export const listCourseQuizzes = async (
  courseId: string,
  viewer: Viewer
): Promise<ManageQuiz[] | StudentQuiz[]> => {
  const course = await findCourseOrThrow(courseId);

  if (canManageCourse(course, viewer)) {
    const quizzes = await Quiz.find({ course: course._id }).sort({ createdAt: 1 });
    return quizzes.map(toManageQuiz);
  }

  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("You do not have access to this course's quizzes.");
  }
  if (course.status !== CourseStatus.PUBLISHED) {
    throw ApiError.notFound("Course not found");
  }
  if (!(await findAccessibleEnrollment(viewer.id, course._id))) {
    throw ApiError.forbidden("You need an active enrollment to view these quizzes.");
  }

  const visibleModules = await Module.find({
    course: course._id,
    isPublished: true,
  }).select("_id");
  const quizzes = await Quiz.find({
    course: course._id,
    isPublished: true,
    $or: [
      { module: { $in: visibleModules.map((module) => module._id) } },
      { module: { $exists: false } },
      { module: null },
    ],
  }).sort({ createdAt: 1 });

  return quizzes.map(toStudentQuiz);
};

/** A student-visible quiz plus that student's own attempt history summary. */
export interface StudentQuizOverview extends StudentQuiz {
  courseId: string;
  courseTitle: string;
  attemptCount: number;
  bestPercentage: number | null;
  passed: boolean;
}

/**
 * Every quiz the authenticated student can take, across all the courses they
 * still have access to, with their own results attached. Powers the student's
 * "Quizzes" screen without an N+1 walk from the client.
 */
export const listMyQuizzes = async (
  viewer: Viewer,
  query: MyQuizzesQuery = { page: 1, limit: 20 }
): Promise<{ quizzes: StudentQuizOverview[]; pagination: PaginationMeta }> => {
  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("Only students have a personal quiz list.");
  }

  const enrollments = await Enrollment.find({
    student: viewer.id,
    status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
  }).select("course");
  const emptyPage = {
    quizzes: [],
    pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
  };
  if (enrollments.length === 0) return emptyPage;

  const courses = await Course.find({
    _id: { $in: enrollments.map((enrollment) => enrollment.course) },
    status: CourseStatus.PUBLISHED,
  }).select("title");
  if (courses.length === 0) return emptyPage;

  const courseIds = courses.map((course) => course._id);
  const titleByCourse = new Map(
    courses.map((course) => [course._id.toString(), course.title])
  );

  const visibleModules = await Module.find({
    course: { $in: courseIds },
    isPublished: true,
  }).select("_id");

  const quizzes = await Quiz.find({
    course: { $in: courseIds },
    isPublished: true,
    $or: [
      { module: { $in: visibleModules.map((module) => module._id) } },
      { module: { $exists: false } },
      { module: null },
    ],
  }).sort({ createdAt: 1 });
  if (quizzes.length === 0) return emptyPage;

  // Paged after the visibility rules, so page 1 is the first quizzes a student
  // can actually take rather than the first rows in the collection.
  const pagination: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total: quizzes.length,
    totalPages: Math.ceil(quizzes.length / query.limit),
  };
  const page = quizzes.slice(
    (query.page - 1) * query.limit,
    query.page * query.limit
  );

  // One aggregate for every attempt, rather than a query per quiz.
  const stats = await QuizAttempt.aggregate<{
    _id: Types.ObjectId;
    attemptCount: number;
    best: number;
    passed: number;
  }>([
    {
      $match: {
        student: new Types.ObjectId(viewer.id),
        quiz: { $in: page.map((quiz) => quiz._id) },
      },
    },
    {
      $group: {
        _id: "$quiz",
        attemptCount: { $sum: 1 },
        best: { $max: "$percentage" },
        passed: { $max: { $cond: ["$passed", 1, 0] } },
      },
    },
  ]);
  const statsByQuiz = new Map(stats.map((row) => [row._id.toString(), row]));

  return {
    quizzes: page.map((quiz) => {
      const stat = statsByQuiz.get(quiz._id.toString());
      return {
        ...toStudentQuiz(quiz),
        courseId: quiz.course.toString(),
        courseTitle: titleByCourse.get(quiz.course.toString()) ?? "",
        attemptCount: stat?.attemptCount ?? 0,
        bestPercentage: stat ? stat.best : null,
        passed: (stat?.passed ?? 0) === 1,
      };
    }),
    pagination,
  };
};

export const getQuiz = async (
  id: string,
  viewer: Viewer
): Promise<ManageQuiz | StudentQuiz> => {
  const quiz = await findQuizOrThrow(id);
  const course = await Course.findById(quiz.course);
  if (!course) {
    throw ApiError.notFound("Quiz not found");
  }

  if (canManageCourse(course, viewer)) {
    return toManageQuiz(quiz);
  }
  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.notFound("Quiz not found");
  }

  const { quiz: studentQuiz } = await loadStudentQuiz(id, viewer);
  return toStudentQuiz(studentQuiz);
};

export const createQuiz = async (
  courseId: string,
  input: CreateQuizInput,
  viewer: Viewer
): Promise<ManageQuiz> => {
  const course = await findCourseOrThrow(courseId);
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage quizzes of your own courses.");
  }

  const quiz = await Quiz.create({
    course: course._id,
    module: input.module ? await resolveModule(input.module, course) : undefined,
    title: input.title,
    description: input.description || undefined,
    passingScore: input.passingScore,
    isRequired: input.isRequired,
    isPublished: false,
    questions: buildQuestions(input.questions),
  });

  return toManageQuiz(quiz);
};

export const updateQuiz = async (
  id: string,
  input: UpdateQuizInput,
  viewer: Viewer
): Promise<ManageQuiz> => {
  const quiz = await findQuizOrThrow(id);
  const course = await assertCanManage(quiz, viewer);

  if (input.title !== undefined) quiz.title = input.title;
  if (input.description !== undefined) quiz.description = input.description || undefined;
  if (input.passingScore !== undefined) quiz.passingScore = input.passingScore;
  if (input.isRequired !== undefined) quiz.isRequired = input.isRequired;
  if (input.module !== undefined) {
    quiz.module = input.module ? await resolveModule(input.module, course) : undefined;
  }
  if (input.questions !== undefined) {
    // Replacing the question set invalidates nothing retroactively: past
    // attempts keep their own recorded score.
    quiz.set("questions", buildQuestions(input.questions));
  }

  await quiz.save();
  return toManageQuiz(quiz);
};

export const setQuizStatus = async (
  id: string,
  isPublished: boolean,
  viewer: Viewer
): Promise<ManageQuiz> => {
  const quiz = await findQuizOrThrow(id);
  await assertCanManage(quiz, viewer);

  if (isPublished && quiz.questions.length === 0) {
    throw ApiError.badRequest("Add at least one question before publishing.");
  }

  quiz.isPublished = isPublished;
  await quiz.save();
  return toManageQuiz(quiz);
};

export const deleteQuiz = async (id: string, viewer: Viewer): Promise<void> => {
  const quiz = await findQuizOrThrow(id);
  await assertCanManage(quiz, viewer);

  // Attempts are a record of student work — never removed as a side effect.
  const hasAttempts = await QuizAttempt.exists({ quiz: quiz._id });
  if (hasAttempts) {
    throw ApiError.conflict(
      "Cannot delete a quiz that students have attempted. Unpublish it instead."
    );
  }

  await quiz.deleteOne();
};
