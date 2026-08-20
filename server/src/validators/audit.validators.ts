import { z } from "zod";
import { AuditAction, AuditTargetType } from "../models/audit-log.model";

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid id");

export const listAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number({ error: "page must be a number" }).int().min(1).default(1),
    limit: z.coerce
      .number({ error: "limit must be a number" })
      .int()
      .min(1)
      .max(100)
      .default(20),
    /** Matches the actor, the target label, or the summary text. */
    search: z.string().trim().max(100).optional(),
    action: z.enum(AuditAction, { error: "Unknown action filter" }).optional(),
    targetType: z.enum(AuditTargetType, { error: "Unknown target type" }).optional(),
    actorId: objectId.optional(),
    targetId: objectId.optional(),
    from: z.coerce.date({ error: "from must be a date" }).optional(),
    to: z.coerce.date({ error: "to must be a date" }).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start of the range must not be after its end",
    path: ["from"],
  });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
