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

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 5000),
  MONGODB_URI: required("MONGODB_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  CLIENT_URL: process.env.CLIENT_URL ?? "http://localhost:5173",
  // Optional — uploads are disabled when unset.
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? "",
} as const;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
