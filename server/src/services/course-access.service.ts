/**
 * Reusable course-content access rules, shared by the lesson endpoints, the
 * learning experience, and future progress APIs:
 *
 *   Admin                     → allowed
 *   Owning instructor         → allowed
 *   Actively enrolled student → allowed (published course only)
 *   Everyone else             → restricted (preview lessons excepted)
 */
import { Types } from "mongoose";
import { CourseDocument, CourseStatus } from "../models/course.model";
import {
  Enrollment,
  EnrollmentDocument,
  EnrollmentStatus,
} from "../models/enrollment.model";
import { UserRole } from "../models/user.model";
import { Viewer } from "./courses.service";

export type CourseAccess = "admin" | "owner" | "enrolled" | "none";

/** Statuses that grant access to course content. */
const ACCESS_GRANTING = [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED];

/**
 * The student's enrollment when it grants access, otherwise null.
 *
 * Finishing a course must not lock a student out of it: a `completed`
 * enrollment keeps full access to the material and the certificate. Only
 * `cancelled` withdraws it.
 */
export const findAccessibleEnrollment = async (
  studentId: string,
  courseId: Types.ObjectId
): Promise<EnrollmentDocument | null> =>
  Enrollment.findOne({
    student: studentId,
    course: courseId,
    status: { $in: ACCESS_GRANTING },
  });

export const getCourseAccess = async (
  course: CourseDocument,
  viewer: Viewer | null
): Promise<CourseAccess> => {
  if (!viewer) return "none";
  if (viewer.role === UserRole.ADMIN) return "admin";
  if (
    viewer.role === UserRole.INSTRUCTOR &&
    course.instructor.toString() === viewer.id
  ) {
    return "owner";
  }
  if (
    viewer.role === UserRole.STUDENT &&
    course.status === CourseStatus.PUBLISHED &&
    (await findAccessibleEnrollment(viewer.id, course._id)) !== null
  ) {
    return "enrolled";
  }
  return "none";
};

export const canAccessCourseContent = (access: CourseAccess): boolean =>
  access !== "none";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records that an enrolled student opened course content. Throttled so bursts
 * of lesson requests don't hammer the database.
 */
export const touchLastAccessed = async (
  studentId: string,
  courseId: Types.ObjectId
): Promise<void> => {
  const threshold = new Date(Date.now() - TOUCH_INTERVAL_MS);
  await Enrollment.updateOne(
    {
      student: studentId,
      course: courseId,
      status: { $in: ACCESS_GRANTING },
      $or: [{ lastAccessedAt: { $lt: threshold } }, { lastAccessedAt: null }],
    },
    { lastAccessedAt: new Date() }
  );
};
