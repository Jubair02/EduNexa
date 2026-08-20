import mongoose, { FilterQuery, Types } from "mongoose";
import { Course, CourseDocument, CourseStatus } from "../models/course.model";
import {
  Enrollment,
  EnrollmentDocument,
  EnrollmentStatus,
  IEnrollment,
} from "../models/enrollment.model";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { Viewer, canManageCourse } from "./courses.service";
import { PaginationMeta } from "./users.service";
import {
  AllEnrollmentsQuery,
  EnrollmentListQuery,
} from "../validators/enrollments.validators";
import { escapeRegex } from "../utils/escapeRegex";

export interface EnrollmentCourseInfo {
  id: string;
  title: string;
  slug: string;
  thumbnail?: { url: string; publicId?: string };
  category: string;
  level: string;
  status: string;
  instructorName: string;
}

export interface EnrollmentStudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SafeEnrollment {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  lastAccessedAt?: Date;
  course: EnrollmentCourseInfo | null;
  student: EnrollmentStudentInfo | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentStatistics {
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  cancelledEnrollments: number;
}

const isPopulated = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !(value instanceof Types.ObjectId);

const toSafeEnrollment = (enrollment: EnrollmentDocument): SafeEnrollment => {
  const rawCourse = enrollment.course as unknown;
  const rawStudent = enrollment.student as unknown;

  let course: EnrollmentCourseInfo | null = null;
  if (isPopulated(rawCourse) && "title" in rawCourse) {
    const c = rawCourse as unknown as CourseDocument & {
      instructor?: { firstName?: string; lastName?: string } | Types.ObjectId;
    };
    const instructor = isPopulated(c.instructor as unknown)
      ? (c.instructor as { firstName?: string; lastName?: string })
      : null;
    course = {
      id: c._id.toString(),
      title: c.title,
      slug: c.slug,
      thumbnail: c.thumbnail ?? undefined,
      category: c.category,
      level: c.level,
      status: c.status,
      instructorName: instructor
        ? `${instructor.firstName ?? ""} ${instructor.lastName ?? ""}`.trim()
        : "Unassigned",
    };
  }

  let student: EnrollmentStudentInfo | null = null;
  if (isPopulated(rawStudent) && "email" in rawStudent) {
    const s = rawStudent as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      email: string;
    };
    student = {
      id: s._id.toString(),
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
    };
  }

  return {
    id: enrollment._id.toString(),
    status: enrollment.status,
    enrolledAt: enrollment.enrolledAt,
    lastAccessedAt: enrollment.lastAccessedAt ?? undefined,
    course,
    student,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
  };
};

const COURSE_POPULATE = {
  path: "course",
  select: "title slug thumbnail category level status instructor",
  populate: { path: "instructor", select: "firstName lastName" },
};
const STUDENT_POPULATE = { path: "student", select: "firstName lastName email" };

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

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/**
 * Enrolls the authenticated student in a published course. The student id is
 * always the authenticated user — never taken from the request. A cancelled
 * enrollment is reactivated instead of creating a second record.
 */
export const enroll = async (
  courseId: string,
  viewer: Viewer
): Promise<SafeEnrollment> => {
  const course = await findCourseOrThrow(courseId);
  if (course.status !== CourseStatus.PUBLISHED) {
    throw ApiError.badRequest("Only published courses can be enrolled in.");
  }

  const existing = await Enrollment.findOne({ student: viewer.id, course: course._id });
  if (existing) {
    if (existing.status === EnrollmentStatus.CANCELLED) {
      existing.status = EnrollmentStatus.ACTIVE;
      existing.lastAccessedAt = new Date();
      await existing.save();
      await existing.populate(COURSE_POPULATE);
      return toSafeEnrollment(existing);
    }
    throw ApiError.conflict("You are already enrolled in this course.");
  }

  try {
    const enrollment = await Enrollment.create({
      student: viewer.id,
      course: course._id,
      status: EnrollmentStatus.ACTIVE,
      enrolledAt: new Date(),
    });
    await enrollment.populate(COURSE_POPULATE);
    return toSafeEnrollment(enrollment);
  } catch (error) {
    // The unique student+course index closes the race between check and create.
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict("You are already enrolled in this course.");
    }
    throw error;
  }
};

export const listMyCourses = async (
  query: EnrollmentListQuery,
  viewer: Viewer
): Promise<{ enrollments: SafeEnrollment[]; pagination: PaginationMeta }> => {
  const filter: FilterQuery<IEnrollment> = { student: viewer.id };
  if (query.status) filter.status = query.status;

  const search = query.search?.trim();
  if (search) {
    const courseIds = await Course.find({
      title: new RegExp(escapeRegex(search), "i"),
    }).select("_id");
    filter.course = { $in: courseIds.map((c) => c._id) };
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(filter),
    Enrollment.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(COURSE_POPULATE),
  ]);

  return {
    enrollments: enrollments.map(toSafeEnrollment),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getEnrollment = async (
  id: string,
  viewer: Viewer
): Promise<SafeEnrollment> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid enrollment id");
  }
  const enrollment = await Enrollment.findById(id)
    .populate(COURSE_POPULATE)
    .populate(STUDENT_POPULATE);
  if (!enrollment) {
    throw ApiError.notFound("Enrollment not found");
  }

  const safe = toSafeEnrollment(enrollment);
  const isOwnEnrollment = safe.student?.id === viewer.id;
  const isCourseOwner =
    viewer.role === UserRole.INSTRUCTOR &&
    safe.course !== null &&
    (await Course.exists({ _id: safe.course.id, instructor: viewer.id })) !== null;

  if (viewer.role !== UserRole.ADMIN && !isOwnEnrollment && !isCourseOwner) {
    // 404 so students can't probe other students' enrollment ids.
    throw ApiError.notFound("Enrollment not found");
  }

  return safe;
};

/** The authenticated student's enrollment state for one course. */
export const checkEnrollment = async (
  courseId: string,
  viewer: Viewer
): Promise<{
  isEnrolled: boolean;
  enrollmentId: string | null;
  status: EnrollmentStatus | null;
}> => {
  if (!mongoose.isValidObjectId(courseId)) {
    throw ApiError.badRequest("Invalid course id");
  }
  const enrollment = await Enrollment.findOne({
    student: viewer.id,
    course: courseId,
  });
  return {
    // "Enrolled" means the enrollment grants access. Completing a course keeps
    // it — only cancelling withdraws access.
    isEnrolled:
      enrollment?.status === EnrollmentStatus.ACTIVE ||
      enrollment?.status === EnrollmentStatus.COMPLETED,
    enrollmentId: enrollment?._id.toString() ?? null,
    status: enrollment?.status ?? null,
  };
};

/**
 * Cancels an active enrollment. The record is kept (active → cancelled) so
 * history survives and re-enrollment can reactivate it.
 */
export const cancelEnrollment = async (
  id: string,
  viewer: Viewer
): Promise<SafeEnrollment> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid enrollment id");
  }
  const enrollment = await Enrollment.findById(id);
  if (!enrollment) {
    throw ApiError.notFound("Enrollment not found");
  }
  if (viewer.role !== UserRole.ADMIN && enrollment.student.toString() !== viewer.id) {
    throw ApiError.notFound("Enrollment not found");
  }
  if (enrollment.status === EnrollmentStatus.CANCELLED) {
    throw ApiError.badRequest("This enrollment is already cancelled.");
  }

  enrollment.status = EnrollmentStatus.CANCELLED;
  await enrollment.save();
  await enrollment.populate(COURSE_POPULATE);
  return toSafeEnrollment(enrollment);
};

/** Enrollments for one course — the owning instructor or an admin only. */
export const listCourseEnrollments = async (
  courseId: string,
  query: EnrollmentListQuery,
  viewer: Viewer
): Promise<{ enrollments: SafeEnrollment[]; pagination: PaginationMeta }> => {
  const course = await findCourseOrThrow(courseId);
  if (!canManageCourse(course, viewer)) {
    throw ApiError.forbidden("You can only view enrollments of your own courses.");
  }

  const filter: FilterQuery<IEnrollment> = { course: course._id };
  if (query.status) filter.status = query.status;

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const students = await User.find({
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }],
    }).select("_id");
    filter.student = { $in: students.map((s) => s._id) };
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(filter),
    Enrollment.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(STUDENT_POPULATE),
  ]);

  return {
    enrollments: enrollments.map(toSafeEnrollment),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

/** Every enrollment on the platform — admin only (enforced at the route). */
export const listAllEnrollments = async (
  query: AllEnrollmentsQuery
): Promise<{ enrollments: SafeEnrollment[]; pagination: PaginationMeta }> => {
  const filter: FilterQuery<IEnrollment> = {};
  if (query.status) filter.status = query.status;
  if (query.course) filter.course = query.course;

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const [students, courses] = await Promise.all([
      User.find({ $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] }).select(
        "_id"
      ),
      Course.find({ title: rx }).select("_id"),
    ]);
    filter.$or = [
      { student: { $in: students.map((s) => s._id) } },
      { course: { $in: courses.map((c) => c._id) } },
    ];
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(filter),
    Enrollment.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(STUDENT_POPULATE)
      .populate(COURSE_POPULATE),
  ]);

  return {
    enrollments: enrollments.map(toSafeEnrollment),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getStatistics = async (): Promise<EnrollmentStatistics> => {
  const [totalEnrollments, activeEnrollments, completedEnrollments, cancelledEnrollments] =
    await Promise.all([
      Enrollment.countDocuments({}),
      Enrollment.countDocuments({ status: EnrollmentStatus.ACTIVE }),
      Enrollment.countDocuments({ status: EnrollmentStatus.COMPLETED }),
      Enrollment.countDocuments({ status: EnrollmentStatus.CANCELLED }),
    ]);
  return { totalEnrollments, activeEnrollments, completedEnrollments, cancelledEnrollments };
};
