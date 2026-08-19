/**
 * The one place a course becomes "completed".
 *
 * Completion is never asserted by a client: it is derived from the Phase 6
 * progress service, and only then written to the enrollment and turned into a
 * certificate. `completedAt` is stamped once and never revised.
 */
import { Types } from "mongoose";
import { Enrollment, EnrollmentStatus } from "../models/enrollment.model";
import {
  countCertificatesForCourse,
  issueCertificateForEnrollment,
  SafeCertificate,
  toSafeCertificate,
} from "./certificates.service";
import { CourseProgress, getCourseProgress } from "./progress.service";

export interface CompletionOutcome {
  /** Authoritative progress, reflecting any completion just recorded. */
  progress: CourseProgress;
  /** True only on the transition incomplete → completed. */
  newlyCompleted: boolean;
  certificate: SafeCertificate | null;
}

/**
 * Reconciles a student's completion state for one course and issues the
 * certificate when the requirements are met. Safe to call repeatedly: after the
 * first success it finds the same enrollment state and the same certificate.
 */
export const checkAndCompleteCourse = async (
  studentId: string,
  courseId: Types.ObjectId
): Promise<CompletionOutcome> => {
  const [enrollment, progress] = await Promise.all([
    Enrollment.findOne({ student: studentId, course: courseId }),
    getCourseProgress(courseId, studentId),
  ]);

  // No enrollment, or a cancelled one, can never complete.
  if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
    return { progress, newlyCompleted: false, certificate: null };
  }

  if (!progress.isCompleted) {
    // Requirements not met. An already-completed enrollment is left alone —
    // adding new lessons to a course must not retract an earned certificate.
    return { progress, newlyCompleted: false, certificate: null };
  }

  const wasCompleted =
    enrollment.status === EnrollmentStatus.COMPLETED && Boolean(enrollment.completedAt);
  const completedAt = enrollment.completedAt ?? new Date();

  if (!wasCompleted) {
    enrollment.status = EnrollmentStatus.COMPLETED;
    enrollment.completedAt = completedAt;
    await enrollment.save();
  }

  const certificate = await issueCertificateForEnrollment(enrollment, completedAt);

  return {
    progress: {
      ...progress,
      completedAt,
      // A revoked certificate stays visible to its owner, so "available" means
      // one exists — its status is reported separately.
      certificateAvailable: true,
      certificateId: certificate._id.toString(),
      certificateStatus: certificate.status,
    },
    newlyCompleted: !wasCompleted,
    certificate: toSafeCertificate(certificate),
  };
};

/** Completion and certificate counts for one course. */
export interface CourseCompletionStatistics {
  enrolledStudents: number;
  activeStudents: number;
  completedStudents: number;
  certificatesIssued: number;
  activeCertificates: number;
  revokedCertificates: number;
  completionRate: number;
}

export const getCourseCompletionStatistics = async (
  courseId: Types.ObjectId
): Promise<CourseCompletionStatistics> => {
  const [enrolledStudents, activeStudents, completedStudents, certificates] =
    await Promise.all([
      Enrollment.countDocuments({
        course: courseId,
        status: { $ne: EnrollmentStatus.CANCELLED },
      }),
      Enrollment.countDocuments({ course: courseId, status: EnrollmentStatus.ACTIVE }),
      Enrollment.countDocuments({ course: courseId, status: EnrollmentStatus.COMPLETED }),
      countCertificatesForCourse(courseId),
    ]);

  return {
    enrolledStudents,
    activeStudents,
    completedStudents,
    certificatesIssued: certificates.issued,
    activeCertificates: certificates.active,
    revokedCertificates: certificates.revoked,
    completionRate:
      enrolledStudents > 0
        ? Math.round((completedStudents / enrolledStudents) * 100)
        : 0,
  };
};
