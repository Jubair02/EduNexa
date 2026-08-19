/**
 * Cloudinary-backed storage for course thumbnails and lesson files.
 * When the CLOUDINARY_* env vars are unset, uploads are disabled and
 * deletion becomes a no-op — the rest of the app keeps working with
 * plain URLs.
 */
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";

export interface StoredFile {
  url: string;
  publicId?: string;
  fileName?: string;
}

const configured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export const isStorageConfigured = (): boolean => configured;

export interface UploadOptions {
  folder: string;
  /** "image" for pictures; "raw" for PDFs and documents. */
  resourceType: "image" | "raw";
  fileName?: string;
}

export const uploadBuffer = (buffer: Buffer, options: UploadOptions): Promise<StoredFile> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resourceType,
        // Keep the original file name in the public id so raw files
        // (PDF/DOCX) download with a sensible name and extension.
        use_filename: Boolean(options.fileName),
        filename_override: options.fileName,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(new Error(error?.message ?? "The file upload failed. Please try again."));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          fileName: options.fileName,
        });
      }
    );
    stream.end(buffer);
  });

/**
 * Best-effort removal of a stored asset. The resource type isn't persisted,
 * so try image first, then raw.
 */
export const deleteStoredFile = async (publicId?: string): Promise<void> => {
  if (!publicId || !configured) return;
  try {
    const asImage = (await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    })) as { result?: string };
    if (asImage.result === "ok") return;
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
  } catch {
    // Cleanup must never break the main operation; orphans can be
    // removed from the Cloudinary console if it ever fails.
  }
};
