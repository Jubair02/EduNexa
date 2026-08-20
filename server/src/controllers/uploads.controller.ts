import { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { DetectedType, detectFileType, sanitizeFileName } from "../utils/fileType";
import { isStorageConfigured, uploadBuffer } from "../utils/fileStorage";
import { logger } from "../utils/logger";

type UploadKind = "image" | "pdf" | "document";

interface KindRules {
  /** Declared types accepted in the multipart header. */
  mimeTypes: string[];
  /** Types the file's own bytes must match — the check that actually counts. */
  detected: DetectedType[];
  maxBytes: number;
  folder: string;
  resourceType: "image" | "raw";
  label: string;
}

const KIND_RULES: Record<UploadKind, KindRules> = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    detected: ["jpeg", "png", "webp"],
    maxBytes: 5 * 1024 * 1024,
    folder: "lms/images",
    resourceType: "image",
    label: "JPEG, PNG, or WEBP image up to 5 MB",
  },
  pdf: {
    mimeTypes: ["application/pdf"],
    detected: ["pdf"],
    maxBytes: 20 * 1024 * 1024,
    folder: "lms/files",
    resourceType: "raw",
    label: "PDF up to 20 MB",
  },
  document: {
    mimeTypes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    detected: ["doc", "docx"],
    maxBytes: 20 * 1024 * 1024,
    folder: "lms/files",
    resourceType: "raw",
    label: "DOC or DOCX up to 20 MB",
  },
};

const isUploadKind = (value: unknown): value is UploadKind =>
  value === "image" || value === "pdf" || value === "document";

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  const kind = req.query.kind;
  if (!isUploadKind(kind)) {
    throw ApiError.badRequest("kind must be image, pdf, or document");
  }
  if (!isStorageConfigured()) {
    throw new ApiError(503, "File uploads are not configured on this server.");
  }
  if (!req.file) {
    throw ApiError.badRequest("Attach a file in the 'file' field");
  }

  const rules = KIND_RULES[kind];
  const rejected = (reason: string): never => {
    // Worth a log line: a mismatch between the declared and actual type is
    // either a broken client or someone probing the upload filter.
    logger.warn("upload.rejected", {
      reason,
      kind,
      declaredMime: req.file?.mimetype,
      size: req.file?.size,
      userId: req.user?._id.toString(),
    });
    throw ApiError.badRequest(`This upload must be a ${rules.label}.`);
  };

  if (req.file.size === 0 || req.file.buffer.length === 0) {
    throw ApiError.badRequest("The file is empty.");
  }
  if (!rules.mimeTypes.includes(req.file.mimetype)) {
    rejected("declared_mime_not_allowed");
  }
  if (req.file.size > rules.maxBytes) {
    rejected("too_large");
  }

  // The client's Content-Type is a claim; the file header is evidence. An
  // HTML page or a script labelled "image/png" fails here.
  const detected = detectFileType(req.file.buffer);
  if (!detected || !rules.detected.includes(detected)) {
    rejected("content_does_not_match_declared_type");
  }

  const stored = await uploadBuffer(req.file.buffer, {
    folder: rules.folder,
    resourceType: rules.resourceType,
    // Never pass the raw name through: it reaches the storage key.
    fileName: sanitizeFileName(req.file.originalname),
  });

  logger.info("upload.stored", {
    kind,
    detected,
    size: req.file.size,
    userId: req.user?._id.toString(),
  });

  res.status(201).json({ success: true, message: "File uploaded", data: stored });
};
