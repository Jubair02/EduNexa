import mongoose from "mongoose";
import { Course, CourseDocument, CourseStatus } from "../models/course.model";
import { Lesson, LessonDocument, LessonType } from "../models/lesson.model";
import { Module, ModuleDocument } from "../models/module.model";
import { ApiError } from "../utils/ApiError";
import { deleteStoredFile } from "../utils/fileStorage";
import {
  canAccessCourseContent,
  getCourseAccess,
  touchLastAccessed,
} from "./course-access.service";
import { Viewer, canManageCourse } from "./courses.service";
import {
  BulkLessonStatusInput,
  CreateLessonInput,
  UpdateLessonInput,
} from "../validators/lessons.validators";

/** Lesson metadata without body content — used in listings. */
export interface SafeLessonSummary {
  id: string;
  module: string;
  course: string;
  title: string;
  description?: string;
  type: LessonType;
  duration?: number;
  order: number;
  isPublished: boolean;
  isPreview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Full lesson, including its type-specific content. */
export interface SafeLesson extends SafeLessonSummary {
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
}

export interface LessonContext {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  moduleId: string;
  moduleTitle: string;
  previousLessonId: string | null;
  nextLessonId: string | null;
}

const toSummary = (lesson: LessonDocument): SafeLessonSummary => ({
  id: lesson._id.toString(),
  module: lesson.module.toString(),
  course: lesson.course.toString(),
  title: lesson.title,
  description: lesson.description || undefined,
  type: lesson.type,
  duration: lesson.duration ?? undefined,
  order: lesson.order,
  isPublished: lesson.isPublished,
  isPreview: lesson.isPreview,
  createdAt: lesson.createdAt,
  updatedAt: lesson.updatedAt,
});

const toSafeLesson = (lesson: LessonDocument): SafeLesson => ({
  ...toSummary(lesson),
  content: lesson.content || undefined,
  videoUrl: lesson.videoUrl || undefined,
  fileUrl: lesson.fileUrl || undefined,
  fileName: lesson.fileName || undefined,
});

const findModuleOrThrow = async (moduleId: string): Promise<ModuleDocument> => {
  if (!mongoose.isValidObjectId(moduleId)) {
    throw ApiError.badRequest("Invalid module id");
  }
  const module = await Module.findById(moduleId);
  if (!module) {
    throw ApiError.notFound("Module not found");
  }
  return module;
};

const findLessonOrThrow = async (id: string): Promise<LessonDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid lesson id");
  }
  const lesson = await Lesson.findById(id);
  if (!lesson) {
    throw ApiError.notFound("Lesson not found");
  }
  return lesson;
};

const getManagedCourse = async (
  courseId: mongoose.Types.ObjectId,
  viewer: Viewer
): Promise<CourseDocument> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage content of your own courses.");
  }
  return course;
};

/**
 * Enforces the type/content matrix: video → videoUrl, text → content,
 * pdf/document → fileUrl. Applied to the lesson's *effective* state so it
 * also covers partial updates and type changes.
 */
const assertValidContent = (effective: {
  type: LessonType;
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
}): void => {
  switch (effective.type) {
    case LessonType.VIDEO:
      if (!effective.videoUrl) {
        throw ApiError.badRequest("Video lessons require a video URL");
      }
      break;
    case LessonType.TEXT:
      if (!effective.content?.trim()) {
        throw ApiError.badRequest("Text lessons require content");
      }
      break;
    case LessonType.PDF:
    case LessonType.DOCUMENT:
      if (!effective.fileUrl) {
        throw ApiError.badRequest(
          effective.type === LessonType.PDF
            ? "PDF lessons require a file URL"
            : "Document lessons require a file URL"
        );
      }
      break;
  }
};

/** Keeps only the content fields relevant to the lesson's type. */
const clearIrrelevantContent = (lesson: LessonDocument): void => {
  if (lesson.type !== LessonType.TEXT) lesson.content = undefined;
  if (lesson.type !== LessonType.VIDEO) lesson.videoUrl = undefined;
  if (lesson.type !== LessonType.PDF && lesson.type !== LessonType.DOCUMENT) {
    lesson.fileUrl = undefined;
    lesson.fileName = undefined;
    lesson.filePublicId = undefined;
  }
};

/** Compacts lesson orders to 1..n within a module. */
const resequenceLessons = async (moduleId: mongoose.Types.ObjectId): Promise<void> => {
  const lessons = await Lesson.find({ module: moduleId }).sort({ order: 1, _id: 1 });
  const updates = lessons
    .map((lesson, index) => ({ lesson, order: index + 1 }))
    .filter(({ lesson, order }) => lesson.order !== order);
  if (updates.length > 0) {
    await Lesson.bulkWrite(
      updates.map(({ lesson, order }) => ({
        updateOne: { filter: { _id: lesson._id }, update: { order } },
      }))
    );
  }
};

export const listLessons = async (
  moduleId: string,
  viewer: Viewer | null
): Promise<SafeLessonSummary[]> => {
  const module = await findModuleOrThrow(moduleId);
  const course = await Course.findById(module.course);
  const manage = course !== null && canManageCourse(course, viewer);

  if (!manage) {
    const visible =
      course !== null &&
      course.status === CourseStatus.PUBLISHED &&
      module.isPublished;
    if (!visible) {
      throw ApiError.notFound("Module not found");
    }
  }

  const lessons = await Lesson.find({
    module: module._id,
    ...(manage ? {} : { isPublished: true }),
  }).sort({ order: 1, _id: 1 });

  return lessons.map(toSummary);
};

/**
 * Returns the full lesson plus its course/module context and previous/next
 * lesson ids following module order, then lesson order — restricted to what
 * the viewer is allowed to see.
 */
export const getLesson = async (
  id: string,
  viewer: Viewer | null
): Promise<{ lesson: SafeLesson; context: LessonContext }> => {
  const lesson = await findLessonOrThrow(id);
  const [course, module] = await Promise.all([
    Course.findById(lesson.course),
    Module.findById(lesson.module),
  ]);
  if (!course || !module) {
    throw ApiError.notFound("Lesson not found");
  }

  const manage = canManageCourse(course, viewer);
  // Whether this viewer may open protected (non-preview) lesson content:
  // admin, owning instructor, or a student with an active enrollment.
  let hasContentAccess = manage;
  if (!manage) {
    const visible =
      course.status === CourseStatus.PUBLISHED &&
      module.isPublished &&
      lesson.isPublished;
    if (!visible) {
      // 404 instead of 403 so unpublished content can't be probed by URL.
      throw ApiError.notFound("Lesson not found");
    }

    const access = await getCourseAccess(course, viewer);
    hasContentAccess = canAccessCourseContent(access);

    if (!lesson.isPreview && !hasContentAccess) {
      throw ApiError.forbidden(
        "You need to enroll in this course to access this lesson."
      );
    }

    if (access === "enrolled" && viewer) {
      await touchLastAccessed(viewer.id, course._id);
    }
  }

  // Build the viewer-visible, course-wide lesson sequence for prev/next.
  // Without content access (previewing anonymously / not enrolled), only
  // preview lessons are reachable, so navigation is limited to them.
  const visibleModules = await Module.find({
    course: course._id,
    ...(manage ? {} : { isPublished: true }),
  })
    .sort({ order: 1, _id: 1 })
    .select("_id");
  const moduleRank = new Map(visibleModules.map((m, index) => [m._id.toString(), index]));

  const sequence = await Lesson.find({
    course: course._id,
    module: { $in: visibleModules.map((m) => m._id) },
    ...(manage ? {} : { isPublished: true }),
    ...(hasContentAccess ? {} : { isPreview: true }),
  })
    .sort({ order: 1, _id: 1 })
    .select("_id module order");

  const ordered = sequence
    .slice()
    .sort(
      (a, b) =>
        (moduleRank.get(a.module.toString()) ?? 0) -
          (moduleRank.get(b.module.toString()) ?? 0) || a.order - b.order
    );
  const index = ordered.findIndex((entry) => entry._id.equals(lesson._id));

  return {
    lesson: toSafeLesson(lesson),
    context: {
      courseId: course._id.toString(),
      courseTitle: course.title,
      courseSlug: course.slug,
      moduleId: module._id.toString(),
      moduleTitle: module.title,
      previousLessonId: index > 0 ? ordered[index - 1]._id.toString() : null,
      nextLessonId:
        index >= 0 && index < ordered.length - 1
          ? ordered[index + 1]._id.toString()
          : null,
    },
  };
};

export const createLesson = async (
  moduleId: string,
  input: CreateLessonInput,
  viewer: Viewer
): Promise<SafeLesson> => {
  const module = await findModuleOrThrow(moduleId);
  // Course and module are derived server-side — a lesson can never be
  // attached to a different course than its module's.
  const course = await getManagedCourse(module.course, viewer);

  assertValidContent({
    type: input.type,
    content: input.content,
    videoUrl: input.videoUrl || undefined,
    fileUrl: input.fileUrl || undefined,
  });

  const last = await Lesson.findOne({ module: module._id }).sort({ order: -1 });
  const lesson = await Lesson.create({
    module: module._id,
    course: course._id,
    title: input.title,
    description: input.description || undefined,
    type: input.type,
    content: input.content || undefined,
    videoUrl: input.videoUrl || undefined,
    fileUrl: input.fileUrl || undefined,
    fileName: input.fileName || undefined,
    filePublicId: input.filePublicId || undefined,
    duration: input.duration ?? undefined,
    order: (last?.order ?? 0) + 1,
    isPublished: false,
    isPreview: input.isPreview ?? false,
  });
  clearIrrelevantContent(lesson);
  await lesson.save();

  return toSafeLesson(lesson);
};

export const updateLesson = async (
  id: string,
  input: UpdateLessonInput,
  viewer: Viewer
): Promise<SafeLesson> => {
  const lesson = await findLessonOrThrow(id);
  await getManagedCourse(lesson.course, viewer);

  // No course/module reassignment — moving lessons is not part of this phase.
  if (input.title !== undefined) lesson.title = input.title;
  if (input.description !== undefined) lesson.description = input.description || undefined;
  if (input.type !== undefined) lesson.type = input.type;
  if (input.content !== undefined) lesson.content = input.content || undefined;
  if (input.videoUrl !== undefined) lesson.videoUrl = input.videoUrl || undefined;
  if (input.fileUrl !== undefined) {
    if (lesson.fileUrl && input.fileUrl !== lesson.fileUrl) {
      // Replacing or clearing the file removes the old stored asset.
      await deleteStoredFile(lesson.filePublicId);
      lesson.filePublicId = undefined;
    }
    lesson.fileUrl = input.fileUrl || undefined;
    if (input.filePublicId !== undefined) {
      lesson.filePublicId = input.filePublicId || undefined;
    }
  }
  if (input.fileName !== undefined) lesson.fileName = input.fileName || undefined;
  if (input.duration !== undefined) lesson.duration = input.duration ?? undefined;
  if (input.isPreview !== undefined) lesson.isPreview = input.isPreview;

  assertValidContent(lesson);
  // Switching away from a file-based type orphans the stored file — remove it.
  if (
    lesson.type !== LessonType.PDF &&
    lesson.type !== LessonType.DOCUMENT &&
    lesson.filePublicId
  ) {
    await deleteStoredFile(lesson.filePublicId);
  }
  clearIrrelevantContent(lesson);
  await lesson.save();

  return toSafeLesson(lesson);
};

export const deleteLesson = async (id: string, viewer: Viewer): Promise<void> => {
  const lesson = await findLessonOrThrow(id);
  await getManagedCourse(lesson.course, viewer);

  const moduleId = lesson.module;
  await deleteStoredFile(lesson.filePublicId);
  await lesson.deleteOne();
  await resequenceLessons(moduleId);
};

export const setLessonStatus = async (
  id: string,
  isPublished: boolean,
  viewer: Viewer
): Promise<SafeLesson> => {
  const lesson = await findLessonOrThrow(id);
  await getManagedCourse(lesson.course, viewer);

  lesson.isPublished = isPublished;
  await lesson.save();
  return toSafeLesson(lesson);
};

export const reorderLessons = async (
  moduleId: string,
  lessonIds: string[],
  viewer: Viewer
): Promise<SafeLessonSummary[]> => {
  const module = await findModuleOrThrow(moduleId);
  await getManagedCourse(module.course, viewer);

  const lessons = await Lesson.find({ module: module._id }).select("_id");
  const existing = new Set(lessons.map((lesson) => lesson._id.toString()));

  if (lessonIds.length !== lessons.length) {
    throw ApiError.badRequest(
      "The reorder list must contain every lesson of the module exactly once"
    );
  }
  for (const lessonId of lessonIds) {
    if (!existing.has(lessonId)) {
      throw ApiError.badRequest("One or more lessons do not belong to this module");
    }
  }

  await Lesson.bulkWrite(
    lessonIds.map((lessonId, index) => ({
      updateOne: { filter: { _id: lessonId }, update: { order: index + 1 } },
    }))
  );

  return listLessons(moduleId, viewer);
};

/**
 * Publishes or unpublishes several lessons in one module at once.
 *
 * Publishing is a three-level chain, so an instructor bringing a module live
 * would otherwise click through every lesson individually. Ownership is checked
 * once, and every id must belong to the named module — a foreign id is refused
 * rather than silently skipped, so the reported count is always the truth.
 */
export const bulkSetLessonStatus = async (
  moduleId: string,
  input: BulkLessonStatusInput,
  viewer: Viewer
): Promise<{ requested: number; affected: number }> => {
  const module = await findModuleOrThrow(moduleId);
  await getManagedCourse(module.course, viewer);

  const owned = await Lesson.find({
    _id: { $in: input.lessonIds },
    module: module._id,
  }).select("_id");

  if (owned.length !== input.lessonIds.length) {
    throw ApiError.badRequest("One or more lessons do not belong to this module");
  }

  const result = await Lesson.updateMany(
    { _id: { $in: input.lessonIds } },
    { isPublished: input.isPublished }
  );

  // Matched, not modified: every id here is known to exist and belong to the
  // module, and all of them are now in the requested state.
  return { requested: input.lessonIds.length, affected: result.matchedCount };
};
