import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // First run downloads a MongoDB binary for mongodb-memory-server.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      // Placeholder — tests connect to an in-memory MongoDB from setup.ts.
      MONGODB_URI: "mongodb://127.0.0.1:27017/lms-test-unused",
      JWT_SECRET: "vitest-only-secret-do-not-use-in-production",
      JWT_EXPIRES_IN: "1h",
      CLIENT_URL: "http://localhost:5173",
      // Keep tests offline — never touch the real Cloudinary account.
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
    },
  },
});
