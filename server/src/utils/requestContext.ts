/**
 * The two things almost every controller needs from a request: who is asking,
 * and which id they asked about. Both were previously redeclared in each
 * controller; they live here so there is one definition to be correct.
 */
import { Request } from "express";
import type { AuditActor } from "../services/audit.service";
import { Viewer } from "../services/courses.service";
import { ApiError } from "./ApiError";

/**
 * The caller, or null for an anonymous request. Used by routes behind
 * `optionalAuthenticate`, where "not signed in" is a valid state that changes
 * what the service returns rather than an error.
 */
export const viewerOrNull = (req: Request): Viewer | null =>
  req.user ? { id: req.user._id.toString(), role: req.user.role } : null;

/**
 * The authenticated caller, reduced to what services authorize against. Throws
 * rather than returning null: routes using this sit behind `authenticate`, so a
 * missing user is a wiring bug, not a request problem.
 */
export const requireViewer = (req: Request): Viewer => {
  const viewer = viewerOrNull(req);
  if (!viewer) {
    throw ApiError.unauthorized();
  }
  return viewer;
};

/**
 * Express 5 types route params as `string | string[]` — a repeated `:id` in the
 * path yields an array. Services expect a single id, so take the first.
 */
export const param = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

/**
 * The caller as an audit actor: a `Viewer` plus the identity an audit entry
 * keeps after the account is gone, and where the request came from.
 *
 * `req.ip` is only the real client when TRUST_PROXY_HOPS matches the number of
 * proxies in front of the API — an audit trail recording the load balancer's
 * address is worse than one recording nothing, because it looks like an answer.
 */
export const requireActor = (req: Request): AuditActor => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  return {
    id: req.user._id.toString(),
    role: req.user.role,
    name: `${req.user.firstName} ${req.user.lastName}`,
    email: req.user.email,
    ip: req.ip ?? "",
    userAgent: req.get("user-agent") ?? "",
  };
};
