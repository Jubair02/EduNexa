import mongoose from "mongoose";
import { isTest } from "./env";

/**
 * Connects to MongoDB via Mongoose. Throws on failure so callers can decide
 * whether to abort startup — the app must not silently run without its
 * database.
 */
export const connectDatabase = async (uri: string): Promise<void> => {
  mongoose.connection.on("error", (error) => {
    if (!isTest) {
      console.error("[db] MongoDB connection error:", error.message);
    }
  });

  mongoose.connection.on("disconnected", () => {
    if (!isTest) {
      console.warn("[db] MongoDB disconnected");
    }
  });

  await mongoose.connect(uri);
  if (!isTest) {
    console.log("[db] MongoDB connected");
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
