import mongoose, { FilterQuery } from "mongoose";
import { IUser, User, UserDocument, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { SafeUser, sanitizeUser } from "../utils/sanitizeUser";
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "../validators/users.validators";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserStatistics {
  totalUsers: number;
  students: number;
  instructors: number;
  admins: number;
  activeUsers: number;
  inactiveUsers: number;
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserOrThrow = async (id: string): Promise<UserDocument> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid user id");
  }
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  return user;
};

const buildListFilter = (query: ListUsersQuery): FilterQuery<IUser> => {
  const filter: FilterQuery<IUser> = {};

  if (query.role) {
    filter.role = query.role;
  }
  if (query.status) {
    filter.isActive = query.status === "active";
  }

  const search = query.search?.trim();
  if (search) {
    const words = search.split(/\s+/).map(escapeRegex);
    if (words.length === 1) {
      const rx = new RegExp(words[0], "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    } else {
      // Multi-word search: every word must match a name part ("john doe"),
      // or the whole string matches the email.
      filter.$or = [
        {
          $and: words.map((word) => {
            const rx = new RegExp(word, "i");
            return { $or: [{ firstName: rx }, { lastName: rx }] };
          }),
        },
        { email: new RegExp(escapeRegex(search), "i") },
      ];
    }
  }

  return filter;
};

export const listUsers = async (
  query: ListUsersQuery
): Promise<{ users: SafeUser[]; pagination: PaginationMeta }> => {
  const filter = buildListFilter(query);
  const sortDirection = query.sortOrder === "asc" ? 1 : -1;

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ [query.sortBy]: sortDirection, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const getUserById = async (id: string): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);
  return sanitizeUser(user);
};

export const createUser = async (input: CreateUserInput): Promise<SafeUser> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw ApiError.conflict("Email is already registered");
  }

  const user = await User.create({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    password: input.password, // hashed by the model's pre-save hook
    role: input.role,
  });

  return sanitizeUser(user);
};

export const updateUser = async (
  id: string,
  input: UpdateUserInput,
  currentUserId: string
): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);
  const isSelf = user._id.toString() === currentUserId;

  if (isSelf && input.role !== undefined && input.role !== user.role) {
    throw ApiError.forbidden("You cannot change your own role.");
  }
  if (isSelf && input.isActive === false) {
    throw ApiError.forbidden("You cannot deactivate your own account.");
  }

  if (input.email !== undefined && input.email !== user.email) {
    const existing = await User.findOne({ email: input.email, _id: { $ne: user._id } });
    if (existing) {
      throw ApiError.conflict("Email is already registered");
    }
    user.email = input.email;
  }

  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.role !== undefined) user.role = input.role;
  if (input.isActive !== undefined) user.isActive = input.isActive;

  await user.save();
  return sanitizeUser(user);
};

export const setUserStatus = async (
  id: string,
  isActive: boolean,
  currentUserId: string
): Promise<SafeUser> => {
  const user = await findUserOrThrow(id);

  if (user._id.toString() === currentUserId && !isActive) {
    throw ApiError.forbidden("You cannot deactivate your own account.");
  }

  user.isActive = isActive;
  await user.save();
  return sanitizeUser(user);
};

export const deleteUser = async (id: string, currentUserId: string): Promise<void> => {
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest("Invalid user id");
  }
  if (id === currentUserId) {
    throw ApiError.forbidden("You cannot delete your own account.");
  }

  const deleted = await User.findByIdAndDelete(id);
  if (!deleted) {
    throw ApiError.notFound("User not found");
  }
};

export const getStatistics = async (): Promise<UserStatistics> => {
  const [totalUsers, students, instructors, admins, activeUsers, inactiveUsers] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: UserRole.STUDENT }),
      User.countDocuments({ role: UserRole.INSTRUCTOR }),
      User.countDocuments({ role: UserRole.ADMIN }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
    ]);

  return { totalUsers, students, instructors, admins, activeUsers, inactiveUsers };
};

export const getRecentUsers = async (limit = 6): Promise<SafeUser[]> => {
  const users = await User.find().sort({ createdAt: -1, _id: -1 }).limit(limit);
  return users.map(sanitizeUser);
};
