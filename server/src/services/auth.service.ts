import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { signToken } from "../utils/jwt";
import { SafeUser, sanitizeUser } from "../utils/sanitizeUser";
import { LoginInput, RegisterInput } from "../validators/auth.validators";

export interface AuthResult {
  user: SafeUser;
  token: string;
}

/**
 * Registers a new user. The role is always `student` — clients cannot
 * self-assign privileged roles; admins/instructors are provisioned separately.
 */
export const registerUser = async (input: RegisterInput): Promise<AuthResult> => {
  const email = input.email.toLowerCase().trim();

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict("Email is already registered");
  }

  const user = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    password: input.password, // hashed by the model's pre-save hook
    role: UserRole.STUDENT,
  });

  const token = signToken({ userId: user._id.toString(), role: user.role });
  return { user: sanitizeUser(user), token };
};

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const email = input.email.toLowerCase().trim();

  // Password is select:false, so it must be requested explicitly here.
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    // Same message as a wrong password so the response doesn't reveal
    // whether an email is registered.
    throw ApiError.unauthorized("Invalid credentials");
  }
  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated.");
  }

  const passwordMatches = await user.comparePassword(input.password);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid credentials");
  }

  const token = signToken({ userId: user._id.toString(), role: user.role });
  return { user: sanitizeUser(user), token };
};
