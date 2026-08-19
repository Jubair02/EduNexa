import type {
  ApiResponse,
  Certificate,
  CertificateListParams,
  CertificateStatus,
  CertificateVerification,
  CourseCompletionStatistics,
  Pagination,
} from "@/types";
import { api, unwrap } from "./api";

const toQuery = (params: CertificateListParams): Record<string, string | number> => {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.status) query.status = params.status;
  if (params.student) query.student = params.student;
  if (params.course) query.course = params.course;
  if (params.sortBy) query.sortBy = params.sortBy;
  if (params.sortOrder) query.sortOrder = params.sortOrder;
  return query;
};

export const certificatesService = {
  async list(
    params: CertificateListParams
  ): Promise<{ certificates: Certificate[]; pagination: Pagination }> {
    const res = await api.get<ApiResponse<Certificate[]>>("/certificates", {
      params: toQuery(params),
    });
    return {
      certificates: res.data.data ?? [],
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
    };
  },

  async get(id: string): Promise<Certificate> {
    const res = await api.get<ApiResponse<{ certificate: Certificate }>>(
      `/certificates/${id}`
    );
    return unwrap(res.data).certificate;
  },

  /** Downloads the PDF. The endpoint is authenticated, so it can't be a plain link. */
  async download(id: string, fileName: string): Promise<void> {
    const res = await api.get<Blob>(`/certificates/${id}/download`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  /** Public — used by the verification page, works without a session. */
  async verify(verificationCode: string): Promise<CertificateVerification> {
    const res = await api.get<ApiResponse<CertificateVerification>>(
      `/certificates/verify/${encodeURIComponent(verificationCode)}`
    );
    return unwrap(res.data);
  },

  async setStatus(id: string, status: CertificateStatus): Promise<Certificate> {
    const res = await api.patch<ApiResponse<{ certificate: Certificate }>>(
      `/certificates/${id}/status`,
      { status }
    );
    return unwrap(res.data).certificate;
  },

  async courseCompletionStatistics(courseId: string): Promise<CourseCompletionStatistics> {
    const res = await api.get<ApiResponse<CourseCompletionStatistics>>(
      `/courses/${courseId}/completion-statistics`
    );
    return unwrap(res.data);
  },
};
