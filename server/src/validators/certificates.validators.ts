import { z } from "zod";
import { CertificateStatus } from "../models/certificate.model";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const objectId = (label: string) =>
  z.string().regex(OBJECT_ID_PATTERN, `${label} must be a valid id`);

export const certificateListQuerySchema = z.object({
  page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int()
    .min(1)
    .max(100)
    .default(10),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(CertificateStatus, { error: "status must be active or revoked" })
    .optional(),
  student: objectId("student").optional(),
  course: objectId("course").optional(),
  sortBy: z
    .enum(["issuedAt", "completionDate", "certificateNumber"])
    .default("issuedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const certificateStatusSchema = z.object({
  status: z.enum(CertificateStatus, {
    error: "status must be active or revoked",
  }),
});

export type CertificateListQuery = z.infer<typeof certificateListQuerySchema>;
export type CertificateStatusInput = z.infer<typeof certificateStatusSchema>;
