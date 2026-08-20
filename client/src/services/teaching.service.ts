import type {
  ApiResponse,
  TeachingOverview,
  TeachingStudentRow,
  TeachingStudentsParams,
  TeachingStudentsResult,
} from "@/types";
import { api, unwrap } from "./api";

export const teachingService = {
  /**
   * The instructor dashboard aggregate. Instructors get their own courses;
   * admins get the whole platform.
   */
  async overview(): Promise<TeachingOverview> {
    const res = await api.get<ApiResponse<TeachingOverview>>("/teaching/overview");
    return unwrap(res.data);
  },

  /** One row per enrolment across the caller's courses. */
  async students(params: TeachingStudentsParams): Promise<TeachingStudentsResult> {
    const query: Record<string, string | number> = {
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    };
    if (params.search.trim()) query.search = params.search.trim();
    if (params.course) query.course = params.course;
    if (params.status) query.status = params.status;

    const res = await api.get<ApiResponse<TeachingStudentRow[]>>("/teaching/students", {
      params: query,
    });
    return {
      students: res.data.data ?? [],
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
