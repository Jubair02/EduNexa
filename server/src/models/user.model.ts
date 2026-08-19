import bcrypt from "bcrypt";
import { HydratedDocument, Model, Schema, model } from "mongoose";

const SALT_ROUNDS = 12;

export enum UserRole {
  ADMIN = "admin",
  INSTRUCTOR = "instructor",
  STUDENT = "student",
}

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // never included in queries unless explicitly requested
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      // Defense in depth: even if a hydrated document is serialized directly,
      // the password hash never leaves the API.
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

userSchema.methods.comparePassword = async function (
  this: UserDocument,
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser, UserModel>("User", userSchema);
