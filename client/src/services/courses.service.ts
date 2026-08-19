import type {
  ApiResponse,
  Course,
  CourseListParams,
  CourseListResult,
  CoursePayload,
  CourseStatistics,
  CourseStatus,
} from "@/types";
import { api, unwrap } from "./api";

export const coursesService = {
  async list(params: CourseListParams): Promise<CourseListResult> {
    const query: Record<string, string | number> = {
      page: params.page,
      limit: params.limit,
      view: params.view,
    };
    if (params.search.trim()) query.search = params.search.trim();
    if (params.category) query.category = params.category;
    if (params.level) query.level = params.level;
    if (params.status) query.status = params.status;
    if (params.instructor) query.instructor = params.instructor;

    const res = await api.get<ApiResponse<Course[]>>("/courses", { params: query });
    return {
      courses: res.data.data ?? [],
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
    };
  },

  async get(idOrSlug: string): Promise<Course> {
    const res = await api.get<ApiResponse<{ course: Course }>>(`/courses/${idOrSlug}`);
    return unwrap(res.data).course;
  },

  async create(payload: CoursePayload): Promise<Course> {
    const res = await api.post<ApiResponse<{ course: Course }>>("/courses", payload);
    return unwrap(res.data).course;
  },

  async update(id: string, payload: Partial<CoursePayload>): Promise<Course> {
    const res = await api.put<ApiResponse<{ course: Course }>>(`/courses/${id}`, payload);
    return unwrap(res.data).course;
  },

  async setStatus(id: string, status: CourseStatus): Promise<Course> {
    const res = await api.patch<ApiResponse<{ course: Course }>>(
      `/courses/${id}/status`,
      { status }
    );
    return unwrap(res.data).course;
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse>(`/courses/${id}`);
  },

  async statistics(): Promise<CourseStatistics> {
    const res = await api.get<ApiResponse<CourseStatistics>>("/courses/statistics");
    return unwrap(res.data);
  },
};
