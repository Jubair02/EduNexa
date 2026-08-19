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
import { LessonProgressInput } from "../validators/progress.validators";

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

/** Every enrolled course with its progress, plus dashboard-level totals. */
export const listMyCoursesProgress = async (
  viewer: Viewer
): Promise<{ courses: MyCourseProgress[]; summary: ProgressSummary }> => {
  const enrollments = await Enrollment.find({
    student: viewer.id,
    status: { $ne: EnrollmentStatus.CANCELLED },
  }).populate({ path: "course", select: "title slug thumbnail" });

  const courses: MyCourseProgress[] = [];
  let requiredItems = 0;
  let completedItems = 0;

  for (const enrollment of enrollments) {
    const rawCourse = enrollment.course as unknown;
    if (
      rawCourse === null ||
      typeof rawCourse !== "object" ||
      !("title" in (rawCourse as Record<string, unknown>))
    ) {
      continue;
    }
    const course = rawCourse as unknown as CourseDocument;

    // Sequential on purpose: a student's course list is small, and this keeps
    // the number of concurrent queries predictable.
    const progress = await getCourseProgress(course._id, viewer.id);
    requiredItems += progress.totalRequiredItems;
    completedItems += progress.completedRequiredItems;

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

  // Best attempt per quiz, so retries can only help a student's average.
  const bestPerQuiz = await QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number }>([
    { $match: { student: new Types.ObjectId(viewer.id) } },
    { $group: { _id: "$quiz", best: { $max: "$percentage" } } },
  ]);
  const averageQuizScore =
    bestPerQuiz.length > 0
      ? Math.round(
          bestPerQuiz.reduce((sum, row) => sum + row.best, 0) / bestPerQuiz.length
        )
      : null;

  return {
    courses,
    summary: {
      activeCourses: courses.filter(
        (entry) => entry.enrollmentStatus === EnrollmentStatus.ACTIVE
      ).length,
      completedCourses: courses.filter((entry) => entry.progress.isCompleted).length,
      overallProgressPercentage: percentage(completedItems, requiredItems),
      averageQuizScore,
      quizzesAttempted: bestPerQuiz.length,
    },
  };
};
