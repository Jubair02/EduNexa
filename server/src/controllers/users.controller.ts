import { Request, Response } from "express";
import * as usersService from "../services/users.service";
import { param, requireActor } from "../utils/requestContext";
import { ListUsersQuery } from "../validators/users.validators";

/**
 * Every mutating handler here passes `requireActor(req)` rather than a bare
 * user id: these are the actions the audit log exists to record, and the
 * service writes the entry where it can see what actually changed.
 *
 * The ad-hoc `logger.warn` calls that used to sit in this file are gone — the
 * audit service emits an operational line of its own alongside the durable
 * entry, so tailing the output still shows sensitive actions as they happen.
 */

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
  const user = await usersService.getUserById(param(req, "id"));
  res.status(200).json({ success: true, message: "User retrieved", data: { user } });
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.createUser(req.body, requireActor(req));
  res.status(201).json({ success: true, message: "User created", data: { user } });
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.updateUser(
    param(req, "id"),
    req.body,
    requireActor(req)
  );
  res.status(200).json({ success: true, message: "User updated", data: { user } });
};

export const setUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { isActive } = req.body as { isActive: boolean };
  const user = await usersService.setUserStatus(
    param(req, "id"),
    isActive,
    requireActor(req)
  );
  res.status(200).json({
    success: true,
    message: isActive ? "User activated" : "User deactivated",
    data: { user },
  });
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  await usersService.deleteUser(param(req, "id"), requireActor(req));
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

export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  const user = await usersService.resetUserPassword(
    param(req, "id"),
    req.body,
    requireActor(req)
  );
  res.status(200).json({
    success: true,
    message: "Password reset",
    data: { user },
  });
};

export const bulkSetUserStatus = async (req: Request, res: Response): Promise<void> => {
  const { isActive } = req.body as { isActive: boolean };
  const result = await usersService.bulkSetUserStatus(req.body, requireActor(req));
  res.status(200).json({
    success: true,
    message: `${result.affected} account${result.affected === 1 ? "" : "s"} ${
      isActive ? "activated" : "deactivated"
    }`,
    data: result,
  });
};

export const bulkDeleteUsers = async (req: Request, res: Response): Promise<void> => {
  const result = await usersService.bulkDeleteUsers(req.body, requireActor(req));
  res.status(200).json({
    success: true,
    message: `${result.affected} account${result.affected === 1 ? "" : "s"} deleted`,
    data: result,
  });
};
