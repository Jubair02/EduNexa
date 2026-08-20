/**
 * Progress is always derived, never stored as a percentage.
 *
 *   required items = published lessons + required published quizzes
 *   progress       = (completed lessons + passed required quizzes)
 *                    / required items × 100
 *
 * Content inside an unpublished module — and unpublished content itself — is
 * excluded, so hiding a lesson never leaves a student stuck above 100%.
 */
import mongoose, { Types } from "mongoose";
import { Certificate, CertificateStatus } from "../models/certificate.model";
import { Course, CourseDocument, CourseStatus } from "../models/course.model";
import { Enrollment, EnrollmentStatus } from "../models/enrollment.model";
import { Lesson, LessonDocument } from "../models/lesson.model";
import { LessonProgress, LessonProgressDocument } from "../models/lesson-progress.model";
import { Module } from "../models/module.model";
import { Quiz } from "../models/quiz.model";
import { QuizAttempt } from "../models/quiz-attempt.model";
import { UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { findAccessibleEnrollment } from "./course-access.service";
import { Viewer } from "./courses.service";
import {
  LessonProgressInput,
  MyCoursesProgressQuery,
} from "../validators/progress.validators";
import { PaginationMeta } from "./users.service";

export interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  totalRequiredQuizzes: number;
  passedRequiredQuizzes: number;
  totalRequiredItems: number;
  completedRequiredItems: number;
  progressPercentage: number;
  isCompleted: boolean;
  /** Stamped by the completion service when requirements were first met. */
  completedAt?: Date;
  /** True when a certificate exists for this student and course. */
  certificateAvailable: boolean;
  certificateId?: string;
  certificateStatus?: CertificateStatus;
  /** Lesson ids the student has completed — drives the learning sidebar. */
  completedLessonIds: string[];
  /** Required-or-not quiz ids the student has passed at least once. */
  passedQuizIds: string[];
}

export interface LessonProgressState {
  lessonId: string;
  isCompleted: boolean;
  completedAt?: Date;
}

export interface MyCourseProgress {
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: { url: string; publicId?: string };
  };
  enrollmentStatus: EnrollmentStatus;
  progress: CourseProgress;
}

export interface ProgressSummary {
  activeCourses: number;
  completedCourses: number;
  overallProgressPercentage: number;
  /** Mean of the best percentage per quiz; null when nothing was attempted. */
  averageQuizScore: number | null;
  quizzesAttempted: number;
}

/** Zero required items means zero progress — never a division by zero. */
const percentage = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/** Ids of modules a student may see: published modules of the course. */
const publishedModuleIds = async (courseId: Types.ObjectId): Promise<Types.ObjectId[]> => {
  const modules = await Module.find({ course: courseId, isPublished: true }).select("_id");
  return modules.map((module) => module._id);
};

/**
 * The graded scope of a course for one student, plus what they've finished.
 * Shared by the progress endpoints and the course-completion check.
 */
export const getCourseProgress = async (
  courseId: Types.ObjectId,
  studentId: string
): Promise<CourseProgress> => {
  const moduleIds = await publishedModuleIds(courseId);

  const [lessons, requiredQuizzes] = await Promise.all([
    Lesson.find({
      course: courseId,
      module: { $in: moduleIds },
      isPublished: true,
    }).select("_id"),
    // A quiz attached to an unpublished module is out of scope, exactly like
    // the lessons inside it.
    Quiz.find({
      course: courseId,
      isPublished: true,
      isRequired: true,
      $or: [{ module: { $in: moduleIds } }, { module: { $exists: false } }, { module: null }],
    }).select("_id"),
  ]);

  const lessonIds = lessons.map((lesson) => lesson._id);
  const quizIds = requiredQuizzes.map((quiz) => quiz._id);

  const [completedRecords, passedRequired, passedAny, enrollment, certificate] =
    await Promise.all([
      LessonProgress.find({
        student: studentId,
        lesson: { $in: lessonIds },
        isCompleted: true,
      }).select("lesson"),
      QuizAttempt.distinct("quiz", {
        student: studentId,
        quiz: { $in: quizIds },
        passed: true,
      }),
      // Includes optional quizzes so the sidebar can tick them off too.
      QuizAttempt.distinct("quiz", {
        student: studentId,
        course: courseId,
        passed: true,
      }),
      Enrollment.findOne({ student: studentId, course: courseId }).select("completedAt"),
      Certificate.findOne({ student: studentId, course: courseId }).select("status"),
    ]);

  const totalLessons = lessonIds.length;
  const completedLessons = completedRecords.length;
  const totalRequiredQuizzes = quizIds.length;
  const passedRequiredQuizzes = passedRequired.length;

  const totalRequiredItems = totalLessons + totalRequiredQuizzes;
  const completedRequiredItems = completedLessons + passedRequiredQuizzes;

  return {
    courseId: courseId.toString(),
    totalLessons,
    completedLessons,
    totalRequiredQuizzes,
    passedRequiredQuizzes,
    totalRequiredItems,
    completedRequiredItems,
    progressPercentage: percentage(completedRequiredItems, totalRequiredItems),
    // An empty course is not "complete" — there is nothing to have finished.
    isCompleted: totalRequiredItems > 0 && completedRequiredItems === totalRequiredItems,
    completedAt: enrollment?.completedAt ?? undefined,
    certificateAvailable: certificate !== null,
    certificateId: certificate?._id.toString(),
    certificateStatus: certificate?.status,
    completedLessonIds: completedRecords.map((record) => record.lesson.toString()),
    passedQuizIds: (passedAny as Types.ObjectId[]).map((id) => id.toString()),
  };
};

/**
 * Loads a lesson a student is allowed to record progress against: published
 * lesson, in a published module, of a published course they're actively
 * enrolled in.
 */
const loadTrackableLesson = async (
  lessonId: string,
  viewer: Viewer
): Promise<{ lesson: LessonDocument; course: CourseDocument }> => {
  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("Only students track lesson progress.");
  }
  if (!mongoose.isValidObjectId(lessonId)) {
    throw ApiError.badRequest("Invalid lesson id");
  }

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }

  const [course, module] = await Promise.all([
    Course.findById(lesson.course),
    Module.findById(lesson.module),
  ]);

  // Anything not publicly visible is reported as missing rather than blocked,
  // so ids can't be probed.
  if (
    !course ||
    !module ||
    course.status !== CourseStatus.PUBLISHED ||
    !module.isPublished ||
    !lesson.isPublished
  ) {
    throw ApiError.notFound("Lesson not found");
  }

  if (!(await findAccessibleEnrollment(viewer.id, course._id))) {
    throw ApiError.forbidden(
      "You need an active enrollment in this course to track progress."
    );
  }

  return { lesson, course };
};

/**
 * Marks a lesson complete or incomplete for the authenticated student. Repeat
 * calls with the same value are no-ops, and the student/course/module are all
 * derived server-side.
 */
export const setLessonProgress = async (
  lessonId: string,
  input: LessonProgressInput,
  viewer: Viewer
): Promise<{ progress: LessonProgressState; courseId: Types.ObjectId }> => {
  const { lesson, course } = await loadTrackableLesson(lessonId, viewer);

  // Only these two fields are ever written from a request. The student, course
  // and module all come from the JWT and the lesson document.
  const update = input.isCompleted
    ? { isCompleted: true, completedAt: new Date() }
    : { isCompleted: false, $unset: { completedAt: 1 } };
  const filter = { student: viewer.id, lesson: lesson._id };

  let record: LessonProgressDocument | null;
  try {
    record = await LessonProgress.findOneAndUpdate(
      filter,
      {
        ...update,
        $setOnInsert: {
          student: viewer.id,
          lesson: lesson._id,
          course: course._id,
          module: lesson.module,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // Two simultaneous requests can both try to insert; the unique
    // student+lesson index lets exactly one win. Updating the winner's record
    // keeps completion idempotent instead of surfacing a duplicate-key error.
    if (!isDuplicateKeyError(error)) throw error;
    record = await LessonProgress.findOneAndUpdate(filter, update, { new: true });
  }

  // The caller reconciles course completion, which also yields the course
  // progress for the response — keeping this service free of that dependency.
  return {
    progress: {
      lessonId: lesson._id.toString(),
      isCompleted: record?.isCompleted ?? input.isCompleted,
      completedAt: record?.completedAt ?? undefined,
    },
    courseId: course._id,
  };
};

export const getLessonProgress = async (
  lessonId: string,
  viewer: Viewer
): Promise<LessonProgressState> => {
  const { lesson } = await loadTrackableLesson(lessonId, viewer);
  const record = await LessonProgress.findOne({
    student: viewer.id,
    lesson: lesson._id,
  });

  return {
    lessonId: lesson._id.toString(),
    isCompleted: record?.isCompleted ?? false,
    completedAt: record?.completedAt ?? undefined,
  };
};

/**
 * Course progress for one student. Students read their own; admins and the
 * owning instructor may inspect any student's via `studentId`.
 */
export const getCourseProgressFor = async (
  courseId: string,
  viewer: Viewer
): Promise<CourseProgress> => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw ApiError.badRequest("Invalid course id");
  }
  const course = await Course.findById(courseId);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }

  if (viewer.role !== UserRole.STUDENT) {
    throw ApiError.forbidden("Course progress is tracked per student.");
  }
  if (!(await findAccessibleEnrollment(viewer.id, course._id))) {
    throw ApiError.forbidden("You need an active enrollment to view course progress.");
  }

  return getCourseProgress(course._id, viewer.id);
};

/**
 * Whole-account progress totals, from aggregations rather than a walk.
 *
 * The summary has to describe every enrolled course, but computing
 * `getCourseProgress` for each one is a query storm — seven queries per course,
 * run in series. These few aggregations answer the same question for all of a
 * student's courses at once, which is what lets the course *rows* be paginated
 * without the summary going wrong.
 */
const summariseAllCourses = async (
  studentId: string,
  courseIds: Types.ObjectId[]
): Promise<{
  requiredItems: number;
  completedItems: number;
  completedCourses: number;
}> => {
  if (courseIds.length === 0) {
    return { requiredItems: 0, completedItems: 0, completedCourses: 0 };
  }

  const publishedModules = await Module.find({
    course: { $in: courseIds },
    isPublished: true,
  }).select("_id");
  const publishedModuleIds = publishedModules.map((module) => module._id);

  const [gradedLessons, requiredQuizzes] = await Promise.all([
    Lesson.find({
      course: { $in: courseIds },
      module: { $in: publishedModuleIds },
      isPublished: true,
    }).select("_id course"),
    Quiz.find({
      course: { $in: courseIds },
      isPublished: true,
      isRequired: true,
      $or: [
        { module: { $in: publishedModuleIds } },
        { module: { $exists: false } },
        { module: null },
      ],
    }).select("_id course"),
  ]);

  /** Per course: how much there is to do, and how much is done. */
  const perCourse = new Map<string, { required: number; done: number }>();
  for (const id of courseIds) {
    perCourse.set(id.toString(), { required: 0, done: 0 });
  }
  for (const lesson of gradedLessons) {
    const row = perCourse.get(lesson.course.toString());
    if (row) row.required += 1;
  }
  for (const quiz of requiredQuizzes) {
    const row = perCourse.get(quiz.course.toString());
    if (row) row.required += 1;
  }

  const [completedRows, passedRows] = await Promise.all([
    LessonProgress.aggregate<{ _id: Types.ObjectId; n: number }>([
      {
        $match: {
          student: new Types.ObjectId(studentId),
          course: { $in: courseIds },
          lesson: { $in: gradedLessons.map((lesson) => lesson._id) },
          isCompleted: true,
        },
      },
      { $group: { _id: "$course", n: { $sum: 1 } } },
    ]),
    QuizAttempt.aggregate<{ _id: Types.ObjectId; n: number }>([
      {
        $match: {
          student: new Types.ObjectId(studentId),
          course: { $in: courseIds },
          quiz: { $in: requiredQuizzes.map((quiz) => quiz._id) },
          passed: true,
        },
      },
      { $group: { _id: "$course", quizzes: { $addToSet: "$quiz" } } },
      { $project: { n: { $size: "$quizzes" } } },
    ]),
  ]);

  for (const row of completedRows) {
    const entry = perCourse.get(row._id.toString());
    if (entry) entry.done += row.n;
  }
  for (const row of passedRows) {
    const entry = perCourse.get(row._id.toString());
    if (entry) entry.done += row.n;
  }

  let requiredItems = 0;
  let completedItems = 0;
  let completedCourses = 0;
  for (const { required, done } of perCourse.values()) {
    requiredItems += required;
    completedItems += done;
    // Same rule as `getCourseProgress`: an empty course is never "complete".
    if (required > 0 && done === required) completedCourses += 1;
  }

  return { requiredItems, completedItems, completedCourses };
};

/**
 * Every enrolled course with its progress, plus dashboard-level totals.
 *
 * The summary always covers the whole account. The course rows are paginated,
 * so only a page's worth of per-course progress is computed in detail — a
 * student with fifty courses costs the same as one with five.
 */
export const listMyCoursesProgress = async (
  viewer: Viewer,
  query: MyCoursesProgressQuery = { page: 1, limit: 20 }
): Promise<{
  courses: MyCourseProgress[];
  summary: ProgressSummary;
  pagination: PaginationMeta;
}> => {
  const enrollments = await Enrollment.find({
    student: viewer.id,
    status: { $ne: EnrollmentStatus.CANCELLED },
  })
    .sort({ enrolledAt: -1 })
    .populate({ path: "course", select: "title slug thumbnail" });

  /** Enrolments whose course still exists — a deleted course has nothing to show. */
  const live = enrollments.filter((enrollment) => {
    const raw = enrollment.course as unknown;
    return (
      raw !== null &&
      typeof raw === "object" &&
      "title" in (raw as Record<string, unknown>)
    );
  });

  const allCourseIds = live.map(
    (enrollment) => (enrollment.course as unknown as CourseDocument)._id
  );

  const [totals, bestPerQuiz] = await Promise.all([
    summariseAllCourses(viewer.id, allCourseIds),
    // Best attempt per quiz, so retries can only help a student's average.
    QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number }>([
      { $match: { student: new Types.ObjectId(viewer.id) } },
      { $group: { _id: "$quiz", best: { $max: "$percentage" } } },
    ]),
  ]);

  const averageQuizScore =
    bestPerQuiz.length > 0
      ? Math.round(
          bestPerQuiz.reduce((sum, row) => sum + row.best, 0) / bestPerQuiz.length
        )
      : null;

  const pagination: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total: live.length,
    totalPages: Math.ceil(live.length / query.limit),
  };

  const page = live.slice((query.page - 1) * query.limit, query.page * query.limit);

  // Detailed progress for the visible rows only. Sequential on purpose: the
  // page size is bounded, and this keeps concurrent query count predictable.
  const courses: MyCourseProgress[] = [];
  for (const enrollment of page) {
    const course = enrollment.course as unknown as CourseDocument;
    const progress = await getCourseProgress(course._id, viewer.id);
    courses.push({
      course: {
        id: course._id.toString(),
        title: course.title,
        slug: course.slug,
        thumbnail: course.thumbnail ?? undefined,
      },
      enrollmentStatus: enrollment.status,
      progress,
    });
  }

  return {
    courses,
    summary: {
      activeCourses: live.filter(
        (enrollment) => enrollment.status === EnrollmentStatus.ACTIVE
      ).length,
      completedCourses: totals.completedCourses,
      overallProgressPercentage: percentage(totals.completedItems, totals.requiredItems),
      averageQuizScore,
      quizzesAttempted: bestPerQuiz.length,
    },
    pagination,
  };
};
