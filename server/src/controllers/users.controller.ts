import { Request, Response } from "express";
import * as usersService from "../services/users.service";
import { ApiError } from "../utils/ApiError";
import { ListUsersQuery } from "../validators/users.validators";

const currentUserId = (req: Request): string => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return req.user._id.toString();
};

// Express 5 types route params as string | string[].
const idParam = (req: Request): string => {
  const { id } = req.params;
  return Array.isArray(id) ? (id[0] ?? "") : id;
};

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as ListUsersQuery;
  const { users, pagination } = await usersService.listUsers(query);
  res.status(200).json({
    success: true,
    message: "Users retrieved",
    data: users,
    pagination,
  });
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.getUserById(idParam(req));
  res.status(200).json({ success: true, message: "User retrieved", data: { user } });
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.createUser(req.body);
  res.status(201).json({ success: true, message: "User created", data: { user } });
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.updateUser(idParam(req), req.body, currentUserId(req));
  res.status(200).json({ success: true, message: "User updated", data: { user } });
};

export const setUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { isActive } = req.body as { isActive: boolean };
  const user = await usersService.setUserStatus(idParam(req), isActive, currentUserId(req));
  res.status(200).json({
    success: true,
    message: isActive ? "User activated" : "User deactivated",
    data: { user },
  });
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  await usersService.deleteUser(idParam(req), currentUserId(req));
  res.status(200).json({ success: true, message: "User deleted" });
};

export const getStatistics = async (_req: Request, res: Response): Promise<void> => {
  const statistics = await usersService.getStatistics();
  res.status(200).json({ success: true, message: "Statistics retrieved", data: statistics });
};

export const getRecentUsers = async (_req: Request, res: Response): Promise<void> => {
  const users = await usersService.getRecentUsers();
  res.status(200).json({ success: true, message: "Recent users retrieved", data: users });
};
