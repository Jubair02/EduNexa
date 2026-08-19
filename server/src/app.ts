import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import apiRoutes from "./routes";

const app = express();

app.disable("x-powered-by");

// CLIENT_URL may be a single origin or a comma-separated list.
const allowedOrigins = env.CLIENT_URL.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "EduNexa API. The web app runs on the Vite dev server (default http://localhost:5173). Health check: GET /api/health",
  });
});

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
