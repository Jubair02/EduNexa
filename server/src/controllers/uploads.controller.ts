import { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { isStorageConfigured, uploadBuffer } from "../utils/fileStorage";

type UploadKind = "image" | "pdf" | "document";

interface KindRules {
  mimeTypes: string[];
  maxBytes: number;
  folder: string;
  resourceType: "image" | "raw";
  label: string;
}

const KIND_RULES: Record<UploadKind, KindRules> = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
    folder: "lms/images",
    resourceType: "image",
    label: "JPEG, PNG, or WEBP image up to 5 MB",
  },
  pdf: {
    mimeTypes: ["application/pdf"],
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
  if (!rules.mimeTypes.includes(req.file.mimetype)) {
    throw ApiError.badRequest(`This upload must be a ${rules.label}.`);
  }
  if (req.file.size > rules.maxBytes) {
    throw ApiError.badRequest(`This upload must be a ${rules.label}.`);
  }

  const stored = await uploadBuffer(req.file.buffer, {
    folder: rules.folder,
    resourceType: rules.resourceType,
    fileName: req.file.originalname || undefined,
  });

  res.status(201).json({ success: true, message: "File uploaded", data: stored });
};
