import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env, isProduction } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { apiLimiter } from "./middleware/rate-limit.middleware";
import apiRoutes from "./routes";

const app = express();

app.disable("x-powered-by");

/**
 * Behind a TLS-terminating proxy, req.ip is the proxy unless Express is told
 * how many hops to trust. Rate limiting keys off req.ip, so getting this wrong
 * merges every visitor into one bucket. Left at 0 for local development.
 */
if (env.TRUST_PROXY_HOPS > 0) {
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
}

/**
 * Security headers. This API serves JSON, never HTML, so the browser is told
 * to run nothing at all: an empty-sandbox CSP, no referrers, and no cross-origin
 * embedding. PDFs are the one exception — they are downloaded, not framed.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
    // HSTS only makes sense once TLS is actually terminated in front of us.
    hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
  })
);

// CLIENT_URL may be a single origin or a comma-separated list.
const allowedOrigins = env.CLIENT_URL.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    // An explicit allowlist, never a wildcard — the API is credentialed.
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message:
      "EduNexa API. The web app runs on the Vite dev server (default http://localhost:5173). Health check: GET /api/health",
  });
});

app.use("/api", apiLimiter, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
