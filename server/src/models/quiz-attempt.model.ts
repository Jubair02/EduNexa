import { HydratedDocument, Model, Schema, Types, model } from "mongoose";

export interface IQuizAnswer {
  questionId: Types.ObjectId;
  selectedAnswer: string;
}

export interface IQuizAttempt {
  quiz: Types.ObjectId;
  /** Denormalized from the quiz for course-scoped reporting. */
  course: Types.ObjectId;
  student: Types.ObjectId;
  answers: IQuizAnswer[];
  /** Points earned — always computed on the server. */
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type QuizAttemptDocument = HydratedDocument<IQuizAttempt>;
type QuizAttemptModel = Model<IQuizAttempt>;

const answerSchema = new Schema<IQuizAnswer>(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    selectedAnswer: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const quizAttemptSchema = new Schema<IQuizAttempt, QuizAttemptModel>(
  {
    quiz: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: [true, "Quiz is required"],
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
    },
    answers: { type: [answerSchema], default: [] },
    score: { type: Number, required: true, min: 0 },
    totalPoints: { type: Number, required: true, min: 0 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    passed: { type: Boolean, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Multiple attempts are allowed, so no unique index here.
quizAttemptSchema.index({ student: 1, quiz: 1 });
quizAttemptSchema.index({ quiz: 1, passed: 1 });
quizAttemptSchema.index({ course: 1 });
quizAttemptSchema.index({ submittedAt: -1 });

export const QuizAttempt = model<IQuizAttempt, QuizAttemptModel>(
  "QuizAttempt",
  quizAttemptSchema
);
