import { ErrorRequestHandler, Request, Response } from "express";
import mongoose from "mongoose";
import { isProduction } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { describeError, logger } from "../utils/logger";

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");

/**
 * Reflects a request path back safely: no query string (it can carry tokens or
 * search terms), length capped, and control characters removed so a hostile
 * URL cannot smuggle escape sequences into a terminal reading the logs.
 */
const safePath = (req: Request): string => {
  const path = req.path.replace(CONTROL_CHARS, "");
  return path.length > 120 ? `${path.slice(0, 120)}…` : path;
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${safePath(req)} not found`,
  });
};

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue?: Record<string, unknown>;
}

const isDuplicateKeyError = (error: unknown): error is MongoDuplicateKeyError =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/**
 * Central error handler — every error in the app funnels here and is turned
 * into the consistent `{ success, message }` envelope. Stack traces and driver
 * internals are never exposed in production responses.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const request = {
    method: req.method,
    path: safePath(req),
    userId: req.user?._id.toString(),
  };

  // Known, intentional errors
  if (err instanceof ApiError) {
    // 401/403 are the interesting ones operationally: they are what a probe or
    // a broken client looks like from the server side.
    if (err.statusCode === 401 || err.statusCode === 403) {
      logger.warn("request.denied", {
        ...request,
        status: err.statusCode,
        reason: err.message,
      });
    }
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  // Mongoose schema validation
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(400).json({ success: false, message: "Validation failed", errors });
    return;
  }

  // Invalid ObjectId and similar cast failures
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ success: false, message: "Invalid identifier format" });
    return;
  }

  // Duplicate unique key (e.g. email already registered)
  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? "value";
    res.status(409).json({
      success: false,
      message: field === "email" ? "Email is already registered" : `Duplicate ${field}`,
    });
    return;
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ success: false, message: "Malformed request body" });
    return;
  }

  // Body larger than the configured JSON limit
  if (
    err instanceof Error &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      success: false,
      message: "That request is too large. Please shorten the content and try again.",
    });
    return;
  }

  // Multer upload errors (file too large, unexpected field, …)
  if (err instanceof Error && err.name === "MulterError") {
    const code = (err as { code?: string }).code;
    logger.warn("upload.multer_error", { ...request, code });
    res.status(400).json({
      success: false,
      message:
        code === "LIMIT_FILE_SIZE"
          ? "The file is too large (maximum 20 MB)."
          : "The file upload was rejected.",
    });
    return;
  }

  // Anything reaching here is a bug or an infrastructure failure. It is logged
  // in full server-side; the client is told nothing about the internals.
  const isDatabaseError =
    err instanceof mongoose.Error || (err as { name?: string })?.name === "MongoServerError";
  logger.error(isDatabaseError ? "database.error" : "unhandled.error", {
    ...request,
    ...describeError(err),
  });

  res.status(500).json({
    success: false,
    message: isProduction
      ? "Something went wrong. Please try again later."
      : err instanceof Error
        ? err.message
        : "Unknown server error",
  });
};
