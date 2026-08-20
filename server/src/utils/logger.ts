/**
 * Minimal structured logger.
 *
 * The rule this enforces: log what happened and enough to find it again, never
 * the payload. Nothing here ever receives a password, a hash, a token, or a
 * request body — callers pass a short context object with ids and outcomes.
 */
import { isTest } from "../config/env";

type Level = "info" | "warn" | "error";

/** Keys that must never reach the log, whatever a caller passes. */
const REDACTED = new Set([
  "password",
  "passwordhash",
  "hash",
  "token",
  "accesstoken",
  "authorization",
  "jwt",
  "secret",
  "apikey",
  "apisecret",
  "verificationcode",
  "answers",
  "correctanswer",
]);

const scrub = (context: Record<string, unknown>): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (REDACTED.has(key.toLowerCase())) {
      safe[key] = "[redacted]";
    } else if (typeof value === "string") {
      safe[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    } else if (typeof value === "object" && value !== null) {
      // Objects are summarized rather than serialized — a nested body is
      // exactly the thing that must not end up in a log line.
      safe[key] = Array.isArray(value) ? `[${value.length} items]` : "[object]";
    } else {
      safe[key] = value;
    }
  }
  return safe;
};

const emit = (level: Level, event: string, context: Record<string, unknown>): void => {
  // Tests assert on behaviour, not on console noise.
  if (isTest) return;

  const line = { level, event, ...scrub(context) };
  const target = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  target(`[${level}] ${event}`, line);
};

export const logger = {
  info: (event: string, context: Record<string, unknown> = {}): void =>
    emit("info", event, context),
  warn: (event: string, context: Record<string, unknown> = {}): void =>
    emit("warn", event, context),
  error: (event: string, context: Record<string, unknown> = {}): void =>
    emit("error", event, context),
};

/** Reduces an unknown thrown value to something safe to log. */
export const describeError = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "UnknownError", message: String(error) };
