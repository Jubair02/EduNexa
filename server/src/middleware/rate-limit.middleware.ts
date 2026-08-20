/**
 * Rate limits sized for classroom use, not for a public API.
 *
 * The tightest bucket is on credential endpoints, where the thing being
 * throttled is password guessing. Everything else gets a ceiling high enough
 * that a real student clicking through a course never notices it, but a script
 * hammering the API does.
 */
import { RequestHandler } from "express";
import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit";
import { env, isTest } from "../config/env";
import { logger } from "../utils/logger";

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

/** Passes everything through when running tests, so suites aren't throttled. */
const passthrough: RequestHandler = (_req, _res, next) => next();

const build = (name: string, max: number, options: Partial<Options> = {}): RequestHandler => {
  if (isTest) return passthrough;

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // The response goes through the same envelope as every other error.
    handler: (req, res) => {
      logger.warn("rate_limit.exceeded", {
        bucket: name,
        method: req.method,
        path: req.path,
        userId: req.user?._id.toString(),
      });
      res.status(429).json({
        success: false,
        message: "Too many requests. Please wait a moment and try again.",
      });
    },
    ...options,
  });
};

/**
 * Login and registration. Keyed by IP *and* the submitted email so one
 * attacker cannot lock out a shared-NAT classroom by burning the IP budget,
 * and cannot spread a guessing run for one account across many emails.
 */
export const authLimiter = build("auth", env.RATE_LIMIT_AUTH_MAX, {
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    // ipKeyGenerator normalizes IPv6 into a /56 subnet key.
    return `${ipKeyGenerator(req.ip ?? "")}:${email}`;
  },
});

/** Quiz submissions and other student writes — one bucket per account. */
export const writeLimiter = build("write", env.RATE_LIMIT_WRITE_MAX, {
  keyGenerator: (req) => req.user?._id.toString() ?? ipKeyGenerator(req.ip ?? ""),
});

/**
 * Account security actions — changing a password, which takes the *current*
 * password as input. Whoever holds a stolen token can guess against this, so it
 * gets the credential-tier budget rather than the generous write one, keyed by
 * account so it cannot be spread across IPs.
 */
export const accountLimiter = build("account", env.RATE_LIMIT_AUTH_MAX, {
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user?._id.toString() ?? ipKeyGenerator(req.ip ?? ""),
});

/** A backstop over the whole API so no single client can saturate it. */
export const apiLimiter = build("api", env.RATE_LIMIT_API_MAX);
