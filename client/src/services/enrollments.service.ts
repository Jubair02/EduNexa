import type {
  ApiResponse,
  Enrollment,
  EnrollmentCheck,
  EnrollmentListParams,
  EnrollmentListResult,
  EnrollmentStatistics,
} from "@/types";
import { api, unwrap } from "./api";

const toQuery = (params: EnrollmentListParams): Record<string, string | number> => {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  if (params.search.trim()) query.search = params.search.trim();
  if (params.status) query.status = params.status;
  if (params.course) query.course = params.course;
  return query;
};

const toResult = (
  res: ApiResponse<Enrollment[]>,
  params: EnrollmentListParams
): EnrollmentListResult => ({
  enrollments: res.data ?? [],
  pagination:
    res.pagination ?? { page: params.page, limit: params.limit, total: 0, totalPages: 0 },
});

export const enrollmentsService = {
  async enroll(courseId: string): Promise<Enrollment> {
    const res = await api.post<ApiResponse<{ enrollment: Enrollment }>>(
      `/courses/${courseId}/enroll`
    );
    return unwrap(res.data).enrollment;
  },

  async check(courseId: string): Promise<EnrollmentCheck> {
    const res = await api.get<ApiResponse<EnrollmentCheck>>(
      `/courses/${courseId}/enrollment`
    );
    return unwrap(res.data);
  },

  async myCourses(params: EnrollmentListParams): Promise<EnrollmentListResult> {
    const res = await api.get<ApiResponse<Enrollment[]>>("/enrollments/my-courses", {
      params: toQuery(params),
    });
    return toResult(res.data, params);
  },

  async get(id: string): Promise<Enrollment> {
    const res = await api.get<ApiResponse<{ enrollment: Enrollment }>>(
      `/enrollments/${id}`
    );
    return unwrap(res.data).enrollment;
  },

  async cancel(id: string): Promise<Enrollment> {
    const res = await api.delete<ApiResponse<{ enrollment: Enrollment }>>(
      `/enrollments/${id}`
    );
    return unwrap(res.data).enrollment;
  },

  async listByCourse(
    courseId: string,
    params: EnrollmentListParams
  ): Promise<EnrollmentListResult> {
    const res = await api.get<ApiResponse<Enrollment[]>>(
      `/courses/${courseId}/enrollments`,
      { params: toQuery(params) }
    );
    return toResult(res.data, params);
  },

  async listAll(params: EnrollmentListParams): Promise<EnrollmentListResult> {
    const res = await api.get<ApiResponse<Enrollment[]>>("/enrollments", {
      params: toQuery(params),
    });
    return toResult(res.data, params);
  },

  async statistics(): Promise<EnrollmentStatistics> {
    const res = await api.get<ApiResponse<EnrollmentStatistics>>(
      "/enrollments/statistics"
    );
    return unwrap(res.data);
  },
};
