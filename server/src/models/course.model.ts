import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export enum CourseLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum CourseStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export const COURSE_CATEGORIES = [
  "programming",
  "web-development",
  "design",
  "business",
  "marketing",
  "data-science",
  "devops",
  "other",
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export interface CourseThumbnail {
  url: string;
  /** Cloudinary public id — reserved for when an upload provider is configured. */
  publicId?: string;
}

export interface ICourse {
  title: string;
  slug: string;
  description: string;
  shortDescription?: string;
  thumbnail?: CourseThumbnail;
  category: CourseCategory;
  level: CourseLevel;
  instructor: Types.ObjectId;
  /** Total duration in minutes. */
  duration?: number;
  status: CourseStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type CourseDocument = HydratedDocument<ICourse>;
type CourseModel = Model<ICourse>;

const courseSchema = new Schema<ICourse, CourseModel>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: [300, "Short description cannot exceed 300 characters"],
    },
    thumbnail: {
      type: new Schema<CourseThumbnail>(
        {
          url: { type: String, required: true, trim: true },
          publicId: { type: String, trim: true },
        },
        { _id: false }
      ),
      required: false,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: COURSE_CATEGORIES,
    },
    level: {
      type: String,
      required: [true, "Level is required"],
      enum: Object.values(CourseLevel),
    },
    instructor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Instructor is required"],
    },
    duration: {
      type: Number,
      min: [1, "Duration must be at least 1 minute"],
    },
    status: {
      type: String,
      enum: Object.values(CourseStatus),
      default: CourseStatus.DRAFT,
    },
  },
  { timestamps: true }
);

courseSchema.index({ title: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ level: 1 });
courseSchema.index({ instructor: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ createdAt: -1 });

export const Course = model<ICourse, CourseModel>("Course", courseSchema);
