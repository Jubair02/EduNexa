import mongoose, { FilterQuery, Types } from "mongoose";
import {
  Certificate,
  CertificateDocument,
  CertificateStatus,
  ICertificate,
} from "../models/certificate.model";
import { Course } from "../models/course.model";
import { EnrollmentDocument } from "../models/enrollment.model";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import {
  generateVerificationCode,
  nextCertificateNumber,
} from "../utils/certificate-ids";
import { Viewer } from "./courses.service";
import { PaginationMeta } from "./users.service";
import {
  CertificateListQuery,
  CertificateStatusInput,
} from "../validators/certificates.validators";

export interface SafeCertificate {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  status: CertificateStatus;
  issuedAt: Date;
  completionDate: Date;
  /** Snapshot values, exactly as printed on the certificate. */
  studentName: string;
  courseTitle: string;
  instructorName: string;
  course: { id: string; title: string; slug: string } | null;
  student: { id: string; firstName: string; lastName: string; email: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The only shape the unauthenticated verification endpoint may return. */
export interface PublicVerification {
  valid: boolean;
  certificateNumber?: string;
  studentName?: string;
  courseTitle?: string;
  instructorName?: string;
  completionDate?: Date;
  issuedAt?: Date;
  status?: CertificateStatus;
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isPopulated = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !(value instanceof Types.ObjectId);

const duplicateKeyFields = (error: unknown): string[] => {
  if (
    typeof error !== "object" ||
    error === null ||
    (error as { code?: unknown }).code !== 11000
  ) {
    return [];
  }
  return Object.keys((error as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
};

export const toSafeCertificate = (certificate: CertificateDocument): SafeCertificate => {
  const rawCourse = certificate.course as unknown;
  const rawStudent = certificate.student as unknown;

  return {
    id: certificate._id.toString(),
    certificateNumber: certificate.certificateNumber,
    verificationCode: certificate.verificationCode,
    status: certificate.status,
    issuedAt: certificate.issuedAt,
    completionDate: certificate.completionDate,
    studentName: certificate.studentName,
    courseTitle: certificate.courseTitle,
    instructorName: certificate.instructorName,
    course:
      isPopulated(rawCourse) && "title" in rawCourse
        ? (() => {
            const course = rawCourse as unknown as {
              _id: Types.ObjectId;
              title: string;
              slug: string;
            };
            return {
              id: course._id.toString(),
              title: course.title,
              slug: course.slug,
            };
          })()
        : null,
    student:
      isPopulated(rawStudent) && "email" in rawStudent
        ? (() => {
            const student = rawStudent as unknown as {
              _id: Types.ObjectId;
              firstName: string;
              lastName: string;
              email: string;
            };
            return {
              id: student._id.toString(),
              firstName: student.firstName,
              lastName: student.lastName,
              email: student.email,
            };
          })()
        : null,
    createdAt: certificate.createdAt,
    updatedAt: certificate.updatedAt,
  };
};

const COURSE_POPULATE = { path: "course", select: "title slug" };
const STUDENT_POPULATE = { path: "student", select: "firstName lastName email" };

/**
 * Issues the certificate for a completed enrollment, or returns the existing
 * one. Every printed value is read from the database — never from a request.
 *
 * Idempotency has two layers: an existence check, and the unique
 * `student + course` index that settles races between concurrent callers.
 */
export const issueCertificateForEnrollment = async (
  enrollment: EnrollmentDocument,
  completionDate: Date
): Promise<CertificateDocument> => {
  const existing = await Certificate.findOne({
    student: enrollment.student,
    course: enrollment.course,
  });
  if (existing) return existing;

  const course = await Course.findById(enrollment.course);
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  const [student, instructor] = await Promise.all([
    User.findById(enrollment.student),
    User.findById(course.instructor),
  ]);
  if (!student) {
    throw ApiError.notFound("Student not found");
  }

  const snapshot = {
    student: enrollment.student,
    course: enrollment.course,
    enrollment: enrollment._id,
    completionDate,
    issuedAt: new Date(),
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    courseTitle: course.title,
    instructorName: instructor
      ? `${instructor.firstName} ${instructor.lastName}`.trim()
      : "Unassigned",
    status: CertificateStatus.ACTIVE,
  };

  // Retry only for identifier collisions; a student+course clash means another
  // request already issued this certificate.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Certificate.create({
        ...snapshot,
        certificateNumber: await nextCertificateNumber(snapshot.issuedAt.getFullYear()),
        verificationCode: generateVerificationCode(),
      });
    } catch (error) {
      const fields = duplicateKeyFields(error);
      if (fields.includes("student") || fields.includes("course")) {
        const raced = await Certificate.findOne({
          student: enrollment.student,
          course: enrollment.course,
        });
        if (raced) return raced;
      }
      if (
        !fields.includes("certificateNumber") &&
        !fields.includes("verificationCode") &&
        fields.length > 0
      ) {
        throw error;
      }
      if (fields.length === 0) throw error;
    }
  }

  throw new ApiError(500, "Could not issue a certificate. Please try again.");
};

const findCertificateOrThrow = async (id: string): Promise<CertificateDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid certificate id");
  }
  const certificate = await Certificate.findById(id)
    .populate(COURSE_POPULATE)
    .populate(STUDENT_POPULATE);
  if (!certificate) {
    throw ApiError.notFound("Certificate not found");
  }
  return certificate;
};

/** Owner or admin only. Instructors have no access to individual certificates. */
const assertCanRead = (certificate: CertificateDocument, viewer: Viewer): void => {
  if (viewer.role === UserRole.ADMIN) return;

  const rawStudent = certificate.student as unknown;
  const ownerId = isPopulated(rawStudent)
    ? String((rawStudent as { _id: Types.ObjectId })._id)
    : certificate.student.toString();

  if (viewer.role !== UserRole.STUDENT || ownerId !== viewer.id) {
    // 404 rather than 403: certificate ids shouldn't be probeable.
    throw ApiError.notFound("Certificate not found");
  }
};

/**
 * Students always get their own certificates only — the student filter is
 * ignored for them. Admins may list everything.
 */
export const listCertificates = async (
  query: CertificateListQuery,
  viewer: Viewer
): Promise<{ certificates: SafeCertificate[]; pagination: PaginationMeta }> => {
  const filter: FilterQuery<ICertificate> = {};

  if (viewer.role === UserRole.STUDENT) {
    filter.student = viewer.id;
  } else if (viewer.role === UserRole.ADMIN) {
    if (query.student) filter.student = query.student;
  } else {
    throw ApiError.forbidden("You do not have access to certificates.");
  }

  if (query.course) filter.course = query.course;
  if (query.status) filter.status = query.status;

  const search = query.search?.trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [
      { certificateNumber: rx },
      { courseTitle: rx },
      { certificateNumber: new RegExp(escapeRegex(search.toUpperCase())) },
      ...(viewer.role === UserRole.ADMIN ? [{ studentName: rx }] : []),
    ];
  }

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const [total, certificates] = await Promise.all([
    Certificate.countDocuments(filter),
    Certificate.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(COURSE_POPULATE)
      .populate(STUDENT_POPULATE),
  ]);

  return {
    certificates: certificates.map(toSafeCertificate),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getCertificate = async (
  id: string,
  viewer: Viewer
): Promise<SafeCertificate> => {
  const certificate = await findCertificateOrThrow(id);
  assertCanRead(certificate, viewer);
  return toSafeCertificate(certificate);
};

/** Returns the document itself — used by the PDF endpoint. */
export const getCertificateDocument = async (
  id: string,
  viewer: Viewer
): Promise<CertificateDocument> => {
  const certificate = await findCertificateOrThrow(id);
  assertCanRead(certificate, viewer);
  return certificate;
};

/**
 * Public lookup. Accepts the verification code or the printed certificate
 * number, and returns only what appears on the certificate itself.
 */
export const verifyCertificate = async (code: string): Promise<PublicVerification> => {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > 64) {
    return { valid: false };
  }

  const certificate = await Certificate.findOne({
    $or: [
      { verificationCode: trimmed.toUpperCase() },
      { certificateNumber: trimmed.toUpperCase() },
    ],
  });
  if (!certificate) {
    return { valid: false };
  }

  return {
    // A revoked certificate is found, reported, and explicitly not valid.
    valid: certificate.status === CertificateStatus.ACTIVE,
    certificateNumber: certificate.certificateNumber,
    studentName: certificate.studentName,
    courseTitle: certificate.courseTitle,
    instructorName: certificate.instructorName,
    completionDate: certificate.completionDate,
    issuedAt: certificate.issuedAt,
    status: certificate.status,
  };
};

/** Admin-only status change; the record is never deleted. */
export const setCertificateStatus = async (
  id: string,
  input: CertificateStatusInput
): Promise<SafeCertificate> => {
  const certificate = await findCertificateOrThrow(id);

  if (certificate.status === input.status) {
    throw ApiError.badRequest(`This certificate is already ${input.status}.`);
  }

  certificate.status = input.status;
  await certificate.save();
  return toSafeCertificate(certificate);
};

export const countCertificatesForCourse = async (
  courseId: Types.ObjectId
): Promise<{ issued: number; active: number; revoked: number }> => {
  const [issued, active, revoked] = await Promise.all([
    Certificate.countDocuments({ course: courseId }),
    Certificate.countDocuments({ course: courseId, status: CertificateStatus.ACTIVE }),
    Certificate.countDocuments({ course: courseId, status: CertificateStatus.REVOKED }),
  ]);
  return { issued, active, revoked };
};
