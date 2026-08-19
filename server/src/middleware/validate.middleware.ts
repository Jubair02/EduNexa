import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

/**
 * Validates and normalizes `req.body` against a Zod schema. On failure,
 * responds 400 with a per-field error list; on success, replaces the body
 * with the parsed (trimmed/normalized) data.
 */
export const validate =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };

/**
 * Validates `req.query` against a Zod schema. Express 5 exposes query as a
 * read-only getter, so the parsed result is stored in `res.locals.query`.
 */
export const validateQuery =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    res.locals.query = result.data;
    next();
  };
