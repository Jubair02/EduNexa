import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export enum LessonType {
  VIDEO = "video",
  TEXT = "text",
  PDF = "pdf",
  DOCUMENT = "document",
}

export interface ILesson {
  module: Types.ObjectId;
  /**
   * Denormalized from the module for fast course-level queries, simpler
   * authorization, and to guard against cross-course assignment. Must always
   * equal module.course — enforced in the service layer.
   */
  course: Types.ObjectId;
  title: string;
  description?: string;
  type: LessonType;
  /** Body for text lessons. */
  content?: string;
  /** External video URL (YouTube, Vimeo, Cloudinary, …) for video lessons. */
  videoUrl?: string;
  /** Stored file URL for pdf/document lessons. */
  fileUrl?: string;
  /** Storage provider id — reserved for Cloudinary cleanup. */
  filePublicId?: string;
  fileName?: string;
  /** Minutes. */
  duration?: number;
  /** 1-based position within the module. */
  order: number;
  isPublished: boolean;
  isPreview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type LessonDocument = HydratedDocument<ILesson>;
type LessonModel = Model<ILesson>;

const lessonSchema = new Schema<ILesson, LessonModel>(
  {
    module: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: [true, "Module is required"],
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    type: {
      type: String,
      required: [true, "Lesson type is required"],
      enum: Object.values(LessonType),
    },
    content: {
      type: String,
      maxlength: [50000, "Content cannot exceed 50000 characters"],
    },
    videoUrl: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    filePublicId: { type: String, trim: true },
    fileName: { type: String, trim: true, maxlength: 255 },
    duration: {
      type: Number,
      min: [1, "Duration must be at least 1 minute"],
    },
    order: {
      type: Number,
      required: true,
      min: [1, "Order must be a positive integer"],
    },
    isPublished: { type: Boolean, default: false },
    isPreview: { type: Boolean, default: false },
  },
  { timestamps: true }
);

lessonSchema.index({ module: 1 });
lessonSchema.index({ course: 1 });
lessonSchema.index({ module: 1, order: 1 });

export const Lesson = model<ILesson, LessonModel>("Lesson", lessonSchema);
