import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UserRole } from "../models/user.model";

/** Minimal claims carried by the access token. */
export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
}

export const signToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

/**
 * Verifies a token and returns its payload.
 * Throws jwt.TokenExpiredError / jwt.JsonWebTokenError on failure.
 */
export const verifyToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).userId !== "string"
  ) {
    throw new jwt.JsonWebTokenError("Malformed token payload");
  }
  return decoded as unknown as AuthTokenPayload;
};
