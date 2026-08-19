import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export interface ILessonProgress {
  student: Types.ObjectId;
  /** Denormalized from the lesson so course-level queries stay single-collection. */
  course: Types.ObjectId;
  module: Types.ObjectId;
  lesson: Types.ObjectId;
  isCompleted: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type LessonProgressDocument = HydratedDocument<ILessonProgress>;
type LessonProgressModel = Model<ILessonProgress>;

const lessonProgressSchema = new Schema<ILessonProgress, LessonProgressModel>(
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
    module: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: [true, "Module is required"],
    },
    lesson: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: [true, "Lesson is required"],
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// One record per student per lesson — completion is idempotent by construction.
lessonProgressSchema.index({ student: 1, lesson: 1 }, { unique: true });
lessonProgressSchema.index({ student: 1, course: 1 });
lessonProgressSchema.index({ course: 1 });

export const LessonProgress = model<ILessonProgress, LessonProgressModel>(
  "LessonProgress",
  lessonProgressSchema
);
