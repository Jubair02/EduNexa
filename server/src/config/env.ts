import dotenv from "dotenv";

dotenv.config();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See server/.env.example.`
    );
  }
  return value;
};

/** Reads a positive integer, falling back to `fallback` when unset or invalid. */
const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer (received "${raw}").`);
  }
  return parsed;
};

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: positiveInt("PORT", 5000),
  MONGODB_URI: required("MONGODB_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",
  /**
   * Number of reverse proxies in front of the API. Must be set on hosts that
   * terminate TLS (Render, Railway, Heroku, an nginx ingress), otherwise every
   * request appears to come from the proxy and rate limiting degrades into one
   * shared bucket for the whole internet.
   */
  TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  /**
   * Max JSON body size. Lesson content allows 50 000 characters and a quiz up
   * to 100 questions, so the ceiling has to clear those comfortably.
   */
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT ?? "1mb",
  /** Rate limiting — generous enough for real classroom use. */
  RATE_LIMIT_WINDOW_MINUTES: positiveInt("RATE_LIMIT_WINDOW_MINUTES", 15),
  RATE_LIMIT_AUTH_MAX: positiveInt("RATE_LIMIT_AUTH_MAX", 20),
  RATE_LIMIT_WRITE_MAX: positiveInt("RATE_LIMIT_WRITE_MAX", 300),
  RATE_LIMIT_API_MAX: positiveInt("RATE_LIMIT_API_MAX", 1000),
  // Optional — uploads are disabled when unset.
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "",
} as const;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/**
 * A JWT secret good enough to sign production sessions with. Checked at
 * startup rather than at first login, so a weak deployment fails loudly and
 * immediately instead of silently issuing forgeable tokens.
 */
export const assertProductionSecrets = (): void => {
  if (!isProduction) return;

  const problems: string[] = [];
  if (env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters in production");
  }
  if (/^(secret|changeme|password|dev|test)/i.test(env.JWT_SECRET)) {
    problems.push("JWT_SECRET looks like a placeholder value");
  }
  if (env.CLIENT_URL.includes("localhost")) {
    problems.push("CLIENT_URL still points at localhost");
  }

  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration:\n  - ${problems.join("\n  - ")}`);
  }
};
