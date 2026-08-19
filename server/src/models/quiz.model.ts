import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export enum QuestionType {
  MULTIPLE_CHOICE = "multiple-choice",
  TRUE_FALSE = "true-false",
}

export interface IQuizQuestion {
  _id: Types.ObjectId;
  questionText: string;
  type: QuestionType;
  /** Choices for multiple-choice; ["true", "false"] for true-false. */
  options: string[];
  /** Must match one of `options`. Never sent to students. */
  correctAnswer: string;
  points: number;
  /** 1-based position within the quiz. */
  order: number;
}

export interface IQuiz {
  course: Types.ObjectId;
  /** Optional — a quiz can sit at course level or inside one module. */
  module?: Types.ObjectId;
  title: string;
  description?: string;
  /** Percentage (0–100) needed to pass. */
  passingScore: number;
  /** Required quizzes count toward course completion. */
  isRequired: boolean;
  isPublished: boolean;
  questions: Types.DocumentArray<IQuizQuestion>;
  createdAt: Date;
  updatedAt: Date;
}

export type QuizDocument = HydratedDocument<IQuiz>;
type QuizModel = Model<IQuiz>;

const questionSchema = new Schema<IQuizQuestion>({
  questionText: {
    type: String,
    required: [true, "Question text is required"],
    trim: true,
    maxlength: [1000, "Question text cannot exceed 1000 characters"],
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(QuestionType),
  },
  options: {
    type: [String],
    required: true,
    validate: {
      validator: (value: string[]) => value.length >= 2,
      message: "A question needs at least two options",
    },
  },
  correctAnswer: {
    type: String,
    required: [true, "A correct answer is required"],
    trim: true,
  },
  points: {
    type: Number,
    required: true,
    min: [1, "Points must be positive"],
  },
  order: {
    type: Number,
    required: true,
    min: [1, "Order must be a positive integer"],
  },
});

const quizSchema = new Schema<IQuiz, QuizModel>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    module: {
      type: Schema.Types.ObjectId,
      ref: "Module",
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
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    passingScore: {
      type: Number,
      required: true,
      min: [0, "Passing score cannot be negative"],
      max: [100, "Passing score cannot exceed 100"],
      default: 70,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    questions: {
      type: [questionSchema],
      validate: {
        validator: (value: IQuizQuestion[]) => value.length >= 1,
        message: "A quiz needs at least one question",
      },
    },
  },
  { timestamps: true }
);

quizSchema.index({ course: 1 });
quizSchema.index({ module: 1 });
quizSchema.index({ course: 1, isPublished: 1 });

export const Quiz = model<IQuiz, QuizModel>("Quiz", quizSchema);
