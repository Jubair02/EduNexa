import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export enum EnrollmentStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export interface IEnrollment {
  student: Types.ObjectId;
  course: Types.ObjectId;
  enrolledAt: Date;
  status: EnrollmentStatus;
  lastAccessedAt?: Date;
  /** Set once, when requirements are first met. Never revised afterwards. */
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentDocument = HydratedDocument<IEnrollment>;
type EnrollmentModel = Model<IEnrollment>;

const enrollmentSchema = new Schema<IEnrollment, EnrollmentModel>(
  {
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
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(EnrollmentStatus),
      default: EnrollmentStatus.ACTIVE,
    },
    lastAccessedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// One enrollment record per student per course — re-enrollment reactivates it.
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ enrolledAt: -1 });
enrollmentSchema.index({ lastAccessedAt: -1 });

export const Enrollment = model<IEnrollment, EnrollmentModel>(
  "Enrollment",
  enrollmentSchema
);
