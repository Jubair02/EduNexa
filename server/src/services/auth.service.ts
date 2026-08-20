import bcrypt from "bcrypt";
import { User, UserDocument, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { signToken } from "../utils/jwt";
import { SafeUser, sanitizeUser } from "../utils/sanitizeUser";
import {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "../validators/auth.validators";

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

/**
 * A real bcrypt hash (cost 12) of a throwaway value, compared against when no
 * account matches. Without it an unknown email answers in under a millisecond
 * while a registered one takes the ~200 ms bcrypt costs — a timing oracle that
 * enumerates accounts. It must stay a *valid* hash: bcrypt rejects a malformed
 * one instantly and the delay disappears.
 */
const TIMING_DECOY_HASH =
  "$2b$12$gxhSLl5TM6HF1mYsottTGu.eNsWeU5AQDxMjvPqMfpNwWMnTr6h3u";

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const email = input.email.toLowerCase().trim();

  // Password is select:false, so it must be requested explicitly here.
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    // Burn the same time a real comparison would, then give the same message a
    // wrong password gets, so neither the timing nor the text reveals whether
    // the email is registered.
    await bcrypt.compare(input.password, TIMING_DECOY_HASH);
    throw ApiError.unauthorized("Invalid credentials");
  }

  const passwordMatches = await user.comparePassword(input.password);
  if (!passwordMatches) {
    throw ApiError.unauthorized("Invalid credentials");
  }
  // Checked after the password so a deactivated account is not disclosed to
  // someone who does not already know its password.
  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated.");
  }

  const token = signToken({ userId: user._id.toString(), role: user.role });
  return { user: sanitizeUser(user), token };
};

/**
 * Updates the caller's own name and email. The user document comes from the
 * authenticated request, never from an id in the body, so this can only ever
 * modify the caller.
 */
export const updateOwnProfile = async (
  user: UserDocument,
  input: UpdateProfileInput
): Promise<SafeUser> => {
  if (input.email !== undefined && input.email !== user.email) {
    const taken = await User.findOne({ email: input.email, _id: { $ne: user._id } });
    if (taken) {
      throw ApiError.conflict("Email is already registered");
    }
    user.email = input.email;
  }
  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;

  await user.save();
  return sanitizeUser(user);
};

/**
 * Changes the caller's own password after verifying the current one. Requiring
 * the current password means a stolen token alone cannot lock the real owner
 * out of their account.
 *
 * The token is not rotated: sessions are stateless, so there is nothing to
 * revoke, and the caller stays signed in — which is what someone changing their
 * own password expects.
 */
export const changeOwnPassword = async (
  user: UserDocument,
  input: ChangePasswordInput
): Promise<void> => {
  // authenticate() loads the user without the password hash (select: false),
  // so it has to be requested explicitly before it can be compared.
  const withPassword = await User.findById(user._id).select("+password");
  if (!withPassword) {
    throw ApiError.unauthorized("This account no longer exists.");
  }

  const matches = await withPassword.comparePassword(input.currentPassword);
  if (!matches) {
    throw ApiError.unauthorized("Your current password is incorrect.");
  }

  withPassword.password = input.newPassword; // hashed by the pre-save hook
  await withPassword.save();
};
