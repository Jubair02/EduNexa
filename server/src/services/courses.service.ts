import mongoose, { FilterQuery } from "mongoose";
import {
  Course,
  CourseCategory,
  CourseDocument,
  CourseLevel,
  CourseStatus,
  CourseThumbnail,
  ICourse,
} from "../models/course.model";
import { Lesson } from "../models/lesson.model";
import { Module } from "../models/module.model";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { deleteStoredFile } from "../utils/fileStorage";
import { slugify } from "../utils/slugify";
import { PaginationMeta } from "./users.service";
import {
  CreateCourseInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from "../validators/courses.validators";

/** The authenticated caller, or null for anonymous/public requests. */
export interface Viewer {
  id: string;
  role: UserRole;
}

export interface CourseInstructorInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SafeCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  thumbnail?: CourseThumbnail;
  category: CourseCategory;
  level: CourseLevel;
  duration?: number;
  status: CourseStatus;
  instructor: CourseInstructorInfo | null;
  createdAt: Date;
  updatedAt: Date;
  contentStats?: CourseContentStats;
}

export interface CourseStatistics {
  totalCourses: number;
  published: number;
  draft: number;
  archived: number;
}

/** Module/lesson counts, included in course details for admin/owner only. */
export interface CourseContentStats {
  totalModules: number;
  publishedModules: number;
  totalLessons: number;
  publishedLessons: number;
}

const INSTRUCTOR_FIELDS = "firstName lastName email";

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isStaff = (viewer: Viewer | null): viewer is Viewer =>
  viewer !== null && (viewer.role === UserRole.ADMIN || viewer.role === UserRole.INSTRUCTOR);

/** True when the viewer may manage this course: admin, or the owning instructor. */
export const canManageCourse = (
  course: Pick<CourseDocument, "instructor">,
  viewer: Viewer | null
): boolean =>
  viewer !== null &&
  (viewer.role === UserRole.ADMIN || course.instructor.toString() === viewer.id);

const toSafeCourse = (course: CourseDocument): SafeCourse => {
  const raw = course.instructor as unknown;
  const instructor =
    raw !== null && typeof raw === "object" && "email" in (raw as Record<string, unknown>)
      ? (() => {
          const u = raw as {
            _id: mongoose.Types.ObjectId;
            firstName: string;
            lastName: string;
            email: string;
          };
          return {
            id: u._id.toString(),
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
          };
        })()
      : null;

  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    description: course.description,
    shortDescription: course.shortDescription || undefined,
    thumbnail: course.thumbnail ?? undefined,
    category: course.category,
    level: course.level,
    duration: course.duration ?? undefined,
    status: course.status,
    instructor,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
};

/**
 * Generates a unique, URL-friendly slug from a title, suffixing -1, -2, …
 * for duplicates. Slugs are kept stable on edits so URLs never break.
 */
export const generateUniqueSlug = async (title: string): Promise<string> => {
  const base = slugify(title) || "course";
  const taken = new Set(
    (
      await Course.find({
        slug: new RegExp(`^${escapeRegex(base)}(-\\d+)?$`),
      }).select("slug")
    ).map((c) => c.slug)
  );

  if (!taken.has(base)) return base;
  let suffix = 1;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

const findCourseOrThrow = async (id: string): Promise<CourseDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid course id");
  }
  const course = await Course.findById(id);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  return course;
};

const assertCanManage = (course: CourseDocument, viewer: Viewer): void => {
  if (viewer.role === UserRole.ADMIN) return;
  if (course.instructor.toString() !== viewer.id) {
    throw ApiError.forbidden("You can only manage your own courses.");
  }
};

const resolveInstructorId = async (candidateId: string): Promise<string> => {
  const user = await User.findById(candidateId);
  if (!user) {
    throw ApiError.badRequest("The selected instructor does not exist");
  }
  if (user.role !== UserRole.INSTRUCTOR) {
    throw ApiError.badRequest("The assigned user must have the instructor role");
  }
  return user._id.toString();
};

export const listCourses = async (
  query: ListCoursesQuery,
  viewer: Viewer | null
): Promise<{ courses: SafeCourse[]; pagination: PaginationMeta }> => {
  const filter: FilterQuery<ICourse> = {};

  if (query.view === "manage") {
    if (!isStaff(viewer)) {
      throw ApiError.forbidden("You do not have permission to manage courses.");
    }
    if (viewer.role === UserRole.INSTRUCTOR) {
      // Instructors only ever see their own courses in manage view.
      filter.instructor = viewer.id;
    } else if (query.instructor) {
      filter.instructor = query.instructor;
    }
    if (query.status) {
      filter.status = query.status;
    }
  } else {
    // Catalog view: everyone (including admins browsing publicly) sees
    // published courses only. A status filter cannot widen this.
    filter.status = CourseStatus.PUBLISHED;
    if (query.instructor) {
      filter.instructor = query.instructor;
    }
  }

  if (query.category) filter.category = query.category;
  if (query.level) filter.level = query.level;

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: rx }, { shortDescription: rx }, { description: rx }];
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, courses] = await Promise.all([
    Course.countDocuments(filter),
    Course.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate("instructor", INSTRUCTOR_FIELDS),
  ]);

  return {
    courses: courses.map(toSafeCourse),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

/** Fetches a course by ObjectId or slug, enforcing role-based visibility. */
export const getCourse = async (
  idOrSlug: string,
  viewer: Viewer | null
): Promise<SafeCourse> => {
  const course = mongoose.isValidObjectId(idOrSlug)
    ? await Course.findById(idOrSlug)
    : await Course.findOne({ slug: idOrSlug.toLowerCase() });

  if (!course) {
    throw ApiError.notFound("Course not found");
  }

  const isAdmin = viewer?.role === UserRole.ADMIN;
  const isOwner =
    viewer?.role === UserRole.INSTRUCTOR && course.instructor.toString() === viewer.id;
  const isPublished = course.status === CourseStatus.PUBLISHED;

  // Hide (rather than 403) unpublished courses from anyone who can't manage
  // them, so their existence isn't leaked.
  if (!isAdmin && !isOwner && !isPublished) {
    throw ApiError.notFound("Course not found");
  }

  await course.populate("instructor", INSTRUCTOR_FIELDS);
  const safe = toSafeCourse(course);

  // Content statistics are management data — admin/owner only.
  if (isAdmin || isOwner) {
    const [totalModules, publishedModules, totalLessons, publishedLessons] =
      await Promise.all([
        Module.countDocuments({ course: course._id }),
        Module.countDocuments({ course: course._id, isPublished: true }),
        Lesson.countDocuments({ course: course._id }),
        Lesson.countDocuments({ course: course._id, isPublished: true }),
      ]);
    return {
      ...safe,
      contentStats: { totalModules, publishedModules, totalLessons, publishedLessons },
    };
  }

  return safe;
};

export const createCourse = async (
  input: CreateCourseInput,
  viewer: Viewer
): Promise<SafeCourse> => {
  // Never trust an instructor id from the frontend for instructors — they
  // always create courses for themselves. Admins must assign a valid instructor.
  let instructorId: string;
  if (viewer.role === UserRole.INSTRUCTOR) {
    instructorId = viewer.id;
  } else {
    if (!input.instructor) {
      throw ApiError.badRequest("An instructor must be assigned to the course");
    }
    instructorId = await resolveInstructorId(input.instructor);
  }

  const course = await Course.create({
    title: input.title,
    slug: await generateUniqueSlug(input.title),
    description: input.description,
    shortDescription: input.shortDescription || undefined,
    thumbnail: input.thumbnail
      ? { url: input.thumbnail, publicId: input.thumbnailPublicId || undefined }
      : undefined,
    category: input.category,
    level: input.level,
    duration: input.duration ?? undefined,
    instructor: instructorId,
    status: CourseStatus.DRAFT,
  });

  await course.populate("instructor", INSTRUCTOR_FIELDS);
  return toSafeCourse(course);
};

export const updateCourse = async (
  id: string,
  input: UpdateCourseInput,
  viewer: Viewer
): Promise<SafeCourse> => {
  const course = await findCourseOrThrow(id);
  assertCanManage(course, viewer);

  if (input.instructor !== undefined) {
    if (viewer.role === UserRole.INSTRUCTOR) {
      if (input.instructor !== viewer.id) {
        throw ApiError.forbidden("Instructors cannot reassign course ownership.");
      }
    } else {
      course.instructor = new mongoose.Types.ObjectId(
        await resolveInstructorId(input.instructor)
      );
    }
  }

  // The slug is intentionally left unchanged on title edits so existing URLs
  // keep working.
  if (input.title !== undefined) course.title = input.title;
  if (input.description !== undefined) course.description = input.description;
  if (input.shortDescription !== undefined) {
    course.shortDescription = input.shortDescription || undefined;
  }
  if (input.category !== undefined) course.category = input.category;
  if (input.level !== undefined) course.level = input.level;
  if (input.duration !== undefined) course.duration = input.duration ?? undefined;
  if (input.thumbnail !== undefined && input.thumbnail !== course.thumbnail?.url) {
    // Replacing or clearing the thumbnail removes the old stored asset.
    await deleteStoredFile(course.thumbnail?.publicId);
    course.thumbnail = input.thumbnail
      ? { url: input.thumbnail, publicId: input.thumbnailPublicId || undefined }
      : undefined;
  }

  await course.save();
  await course.populate("instructor", INSTRUCTOR_FIELDS);
  return toSafeCourse(course);
};

export const deleteCourse = async (id: string, viewer: Viewer): Promise<void> => {
  const course = await findCourseOrThrow(id);
  assertCanManage(course, viewer);

  if (viewer.role === UserRole.INSTRUCTOR && course.status === CourseStatus.PUBLISHED) {
    throw ApiError.forbidden(
      "Published courses must be archived before they can be deleted."
    );
  }

  // Never silently cascade-delete course content.
  const hasModules = await Module.exists({ course: course._id });
  if (hasModules) {
    throw ApiError.conflict(
      "Cannot delete a course that contains modules. Remove its modules and lessons first."
    );
  }

  await deleteStoredFile(course.thumbnail?.publicId);
  await course.deleteOne();
};

export const setCourseStatus = async (
  id: string,
  status: CourseStatus,
  viewer: Viewer
): Promise<SafeCourse> => {
  const course = await findCourseOrThrow(id);
  assertCanManage(course, viewer);

  if (course.status === status) {
    throw ApiError.badRequest(`Course is already ${status}`);
  }

  course.status = status;
  await course.save();
  await course.populate("instructor", INSTRUCTOR_FIELDS);
  return toSafeCourse(course);
};

/** Admin: platform-wide counts. Instructor: counts of their own courses only. */
export const getStatistics = async (viewer: Viewer): Promise<CourseStatistics> => {
  const base: FilterQuery<ICourse> =
    viewer.role === UserRole.INSTRUCTOR ? { instructor: viewer.id } : {};

  const [totalCourses, published, draft, archived] = await Promise.all([
    Course.countDocuments(base),
    Course.countDocuments({ ...base, status: CourseStatus.PUBLISHED }),
    Course.countDocuments({ ...base, status: CourseStatus.DRAFT }),
    Course.countDocuments({ ...base, status: CourseStatus.ARCHIVED }),
  ]);

  return { totalCourses, published, draft, archived };
};
