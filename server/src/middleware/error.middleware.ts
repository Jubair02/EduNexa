import { ErrorRequestHandler, Request, Response } from "express";
import mongoose from "mongoose";
import { isProduction, isTest } from "../config/env";
import { ApiError } from "../utils/ApiError";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
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
 * into the consistent `{ success, message }` envelope. Stack traces are never
 * exposed in production responses.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Known, intentional errors
  if (err instanceof ApiError) {
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

  // Multer upload errors (file too large, unexpected field, …)
  if (err instanceof Error && err.name === "MulterError") {
    const message =
      (err as { code?: string }).code === "LIMIT_FILE_SIZE"
        ? "The file is too large (maximum 20 MB)."
        : "The file upload was rejected.";
    res.status(400).json({ success: false, message });
    return;
  }

  if (!isTest) {
    console.error("[error] Unhandled error:", err);
  }

  res.status(500).json({
    success: false,
    message: isProduction
      ? "Something went wrong. Please try again later."
      : err instanceof Error
        ? err.message
        : "Unknown server error",
  });
};
