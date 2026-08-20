import { Request, Response } from "express";
import * as auditService from "../services/audit.service";
import { ListAuditLogsQuery } from "../validators/audit.validators";

export const listAuditLogs = async (_req: Request, res: Response): Promise<void> => {
  const query = res.locals.query as ListAuditLogsQuery;
  const { logs, pagination } = await auditService.listAuditLogs(query);
  res.status(200).json({
    success: true,
    message: "Audit log retrieved",
    data: logs,
    pagination,
  });
};
