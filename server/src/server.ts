import app from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { assertProductionSecrets, env } from "./config/env";

const start = async (): Promise<void> => {
  // Fail loudly at boot rather than silently issuing forgeable tokens.
  try {
    assertProductionSecrets();
  } catch (error) {
    console.error(
      "[server]",
      error instanceof Error ? error.message : "Invalid configuration"
    );
    process.exit(1);
  }

  try {
    await connectDatabase(env.MONGODB_URI);
  } catch (error) {
    console.error(
      "[server] Failed to connect to MongoDB — aborting startup:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[server] API running at http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} received — shutting down gracefully`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
  process.exit(1);
});

void start();
