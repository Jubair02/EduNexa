import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export enum CertificateStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
}

export interface ICertificate {
  /** Human-readable, e.g. "LMS-2026-000001". Server-generated. */
  certificateNumber: string;
  /** Public, unguessable identifier used for verification URLs. */
  verificationCode: string;
  student: Types.ObjectId;
  course: Types.ObjectId;
  enrollment: Types.ObjectId;
  issuedAt: Date;
  completionDate: Date;
  /**
   * Snapshots taken at issue time. A certificate must keep saying what it said
   * on the day it was earned, even if the person renames themselves or the
   * course is retitled later.
   */
  studentName: string;
  courseTitle: string;
  instructorName: string;
  status: CertificateStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CertificateDocument = HydratedDocument<ICertificate>;
type CertificateModel = Model<ICertificate>;

const certificateSchema = new Schema<ICertificate, CertificateModel>(
  {
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    verificationCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    enrollment: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      required: [true, "Enrollment is required"],
    },
    issuedAt: { type: Date, default: Date.now },
    completionDate: { type: Date, required: true },
    studentName: { type: String, required: true, trim: true },
    courseTitle: { type: String, required: true, trim: true },
    instructorName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: Object.values(CertificateStatus),
      default: CertificateStatus.ACTIVE,
    },
  },
  { timestamps: true }
);

// One certificate per student per course — the database, not application
// timing, is what makes issuing idempotent.
certificateSchema.index({ student: 1, course: 1 }, { unique: true });
certificateSchema.index({ student: 1, issuedAt: -1 });
certificateSchema.index({ course: 1, issuedAt: -1 });
certificateSchema.index({ status: 1 });

export const Certificate = model<ICertificate, CertificateModel>(
  "Certificate",
  certificateSchema
);
