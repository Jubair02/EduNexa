import mongoose from "mongoose";
import { Course, CourseDocument, CourseStatus } from "../models/course.model";
import { Lesson } from "../models/lesson.model";
import { Module, ModuleDocument } from "../models/module.model";
import { ApiError } from "../utils/ApiError";
import { Viewer, canManageCourse } from "./courses.service";
import { CreateModuleInput, UpdateModuleInput } from "../validators/modules.validators";

export interface SafeModule {
  id: string;
  course: string;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
  lessonCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const toSafeModule = (module: ModuleDocument, lessonCount = 0): SafeModule => ({
  id: module._id.toString(),
  course: module.course.toString(),
  title: module.title,
  description: module.description || undefined,
  order: module.order,
  isPublished: module.isPublished,
  lessonCount,
  createdAt: module.createdAt,
  updatedAt: module.updatedAt,
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

const findModuleOrThrow = async (id: string): Promise<ModuleDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid module id");
  }
  const module = await Module.findById(id);
  if (!module) {
    throw ApiError.notFound("Module not found");
  }
  return module;
};

/** Loads the module's course and asserts the viewer may manage it. */
const getManagedCourseForModule = async (
  module: ModuleDocument,
  viewer: Viewer
): Promise<CourseDocument> => {
  const course = await Course.findById(module.course);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage content of your own courses.");
  }
  return course;
};

const lessonCountsByModule = async (
  courseId: mongoose.Types.ObjectId,
  publishedOnly: boolean
): Promise<Map<string, number>> => {
  const rows = await Lesson.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { course: courseId, ...(publishedOnly ? { isPublished: true } : {}) } },
    { $group: { _id: "$module", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
};

/** Compacts module orders to 1..n after a deletion. */
const resequenceModules = async (courseId: mongoose.Types.ObjectId): Promise<void> => {
  const modules = await Module.find({ course: courseId }).sort({ order: 1, _id: 1 });
  const updates = modules
    .map((module, index) => ({ module, order: index + 1 }))
    .filter(({ module, order }) => module.order !== order);
  if (updates.length > 0) {
    await Module.bulkWrite(
      updates.map(({ module, order }) => ({
        updateOne: { filter: { _id: module._id }, update: { order } },
      }))
    );
  }
};

/**
 * Lists a course's modules in order. Admin/owner see everything; everyone
 * else sees published modules of published courses only (with published
 * lesson counts).
 */
export const listModules = async (
  courseId: string,
  viewer: Viewer | null
): Promise<SafeModule[]> => {
  const course = await findCourseOrThrow(courseId);
  const manage = canManageCourse(course, viewer);

  if (!manage && course.status !== CourseStatus.PUBLISHED) {
    throw ApiError.notFound("Course not found");
  }

  const [modules, counts] = await Promise.all([
    Module.find({ course: course._id, ...(manage ? {} : { isPublished: true }) }).sort({
      order: 1,
      _id: 1,
    }),
    lessonCountsByModule(course._id, !manage),
  ]);

  return modules.map((module) =>
    toSafeModule(module, counts.get(module._id.toString()) ?? 0)
  );
};

export const getModule = async (
  id: string,
  viewer: Viewer | null
): Promise<SafeModule> => {
  const module = await findModuleOrThrow(id);
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

  const lessonCount = await Lesson.countDocuments({
    module: module._id,
    ...(manage ? {} : { isPublished: true }),
  });
  return toSafeModule(module, lessonCount);
};

export const createModule = async (
  courseId: string,
  input: CreateModuleInput,
  viewer: Viewer
): Promise<SafeModule> => {
  const course = await findCourseOrThrow(courseId);
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage content of your own courses.");
  }

  const last = await Module.findOne({ course: course._id }).sort({ order: -1 });
  const module = await Module.create({
    course: course._id,
    title: input.title,
    description: input.description || undefined,
    order: (last?.order ?? 0) + 1,
    isPublished: false,
  });

  return toSafeModule(module, 0);
};

export const updateModule = async (
  id: string,
  input: UpdateModuleInput,
  viewer: Viewer
): Promise<SafeModule> => {
  const module = await findModuleOrThrow(id);
  await getManagedCourseForModule(module, viewer);

  // Only title/description are editable — modules cannot move between courses.
  if (input.title !== undefined) module.title = input.title;
  if (input.description !== undefined) {
    module.description = input.description || undefined;
  }

  await module.save();
  const lessonCount = await Lesson.countDocuments({ module: module._id });
  return toSafeModule(module, lessonCount);
};

export const deleteModule = async (id: string, viewer: Viewer): Promise<void> => {
  const module = await findModuleOrThrow(id);
  await getManagedCourseForModule(module, viewer);

  const hasLessons = await Lesson.exists({ module: module._id });
  if (hasLessons) {
    throw ApiError.conflict(
      "Cannot delete a module that contains lessons. Delete or move its lessons first."
    );
  }

  const courseId = module.course;
  await module.deleteOne();
  await resequenceModules(courseId);
};

export const setModuleStatus = async (
  id: string,
  isPublished: boolean,
  viewer: Viewer
): Promise<SafeModule> => {
  const module = await findModuleOrThrow(id);
  await getManagedCourseForModule(module, viewer);

  module.isPublished = isPublished;
  await module.save();
  const lessonCount = await Lesson.countDocuments({ module: module._id });
  return toSafeModule(module, lessonCount);
};

export const reorderModules = async (
  courseId: string,
  moduleIds: string[],
  viewer: Viewer
): Promise<SafeModule[]> => {
  const course = await findCourseOrThrow(courseId);
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only manage content of your own courses.");
  }

  const modules = await Module.find({ course: course._id }).select("_id");
  const existing = new Set(modules.map((module) => module._id.toString()));

  if (moduleIds.length !== modules.length) {
    throw ApiError.badRequest(
      "The reorder list must contain every module of the course exactly once"
    );
  }
  for (const id of moduleIds) {
    if (!existing.has(id)) {
      throw ApiError.badRequest("One or more modules do not belong to this course");
    }
  }

  await Module.bulkWrite(
    moduleIds.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { order: index + 1 } },
    }))
  );

  return listModules(courseId, viewer);
};
