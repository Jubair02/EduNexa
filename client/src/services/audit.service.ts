import type {
  ApiResponse,
  AuditListParams,
  AuditListResult,
  AuditLogEntry,
} from "@/types";
import { api } from "./api";

export const auditService = {
  async list(params: AuditListParams): Promise<AuditListResult> {
    const query: Record<string, string | number> = {
      page: params.page,
      limit: params.limit,
    };
    if (params.search.trim()) query.search = params.search.trim();
    if (params.action) query.action = params.action;
    if (params.from) query.from = params.from;
    if (params.to) query.to = params.to;

    const res = await api.get<ApiResponse<AuditLogEntry[]>>("/audit-logs", {
      params: query,
    });
    return {
      logs: res.data.data ?? [],
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
    };
  },
};
