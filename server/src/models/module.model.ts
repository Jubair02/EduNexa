import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export interface IModule {
  course: Types.ObjectId;
  title: string;
  description?: string;
  /** 1-based position within the course. */
  order: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ModuleDocument = HydratedDocument<IModule>;
type ModuleModel = Model<IModule>;

const moduleSchema = new Schema<IModule, ModuleModel>(
  {
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
    order: {
      type: Number,
      required: true,
      min: [1, "Order must be a positive integer"],
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

moduleSchema.index({ course: 1 });
moduleSchema.index({ course: 1, order: 1 });

export const Module = model<IModule, ModuleModel>("Module", moduleSchema);
