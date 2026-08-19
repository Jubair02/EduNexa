import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User, UserRole } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";

/**
 * Reads the Bearer token, verifies it, loads the user, and attaches it to the
 * request. Rejects missing/invalid/expired tokens with 401 and deactivated
 * accounts with 403.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Authentication required. Please log in.");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw ApiError.unauthorized("Authentication required. Please log in.");
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized("Your session has expired. Please log in again.");
      }
      throw ApiError.unauthorized("Invalid authentication token.");
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      throw ApiError.unauthorized("This account no longer exists.");
    }
    if (!user.isActive) {
      throw ApiError.forbidden("This account has been deactivated.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Like `authenticate`, but anonymous requests pass through with no user
 * attached. A token that IS supplied must still be valid — garbage tokens are
 * rejected rather than silently treated as anonymous.
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next();
    return;
  }
  await authenticate(req, res, next);
};

/**
 * Role-based access control. Use after `authenticate`:
 *
 *   router.get("/admin", authenticate, authorize(UserRole.ADMIN), handler)
 *   router.get("/staff", authenticate, authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), handler)
 */
export const authorize =
  (...allowedRoles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized("Authentication required. Please log in."));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(ApiError.forbidden("You do not have permission to access this resource."));
      return;
    }
    next();
  };
