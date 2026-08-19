import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { sanitizeUser } from "../utils/sanitizeUser";

// Express 5 forwards rejected promises from async handlers to the error
// middleware automatically, so no wrapper is needed.

export const register = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.registerUser(req.body);
  res.status(201).json({
    success: true,
    message: "Registration successful",
    data: result,
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.loginUser(req.body);
  res.status(200).json({
    success: true,
    message: "Login successful",
    data: result,
  });
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  res.status(200).json({
    success: true,
    message: "Current user retrieved",
    data: { user: sanitizeUser(req.user) },
  });
};

/**
 * Stateless JWT logout: the client discards its token. The endpoint exists so
 * the contract is stable when server-side revocation (token denylist /
 * refresh-token sessions) is added in a later phase.
 */
export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};
