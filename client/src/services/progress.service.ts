import type {
  ApiResponse,
  CourseProgress,
  LessonProgressState,
  MyCourseProgress,
  Pagination,
  ProgressSummary,
} from "@/types";
import { api, unwrap } from "./api";

interface LessonProgressResponse {
  progress: LessonProgressState;
  courseProgress: CourseProgress;
}

export const progressService = {

  async setLessonProgress(
    lessonId: string,
    isCompleted: boolean
  ): Promise<LessonProgressResponse> {
    const res = await api.patch<ApiResponse<LessonProgressResponse>>(
      `/lessons/${lessonId}/progress`,
      { isCompleted }
    );
    return unwrap(res.data);
  },

  async getLessonProgress(lessonId: string): Promise<LessonProgressState> {
    const res = await api.get<ApiResponse<{ progress: LessonProgressState }>>(
      `/lessons/${lessonId}/progress`
    );
    return unwrap(res.data).progress;
  },

  async getCourseProgress(courseId: string): Promise<CourseProgress> {
    const res = await api.get<ApiResponse<{ progress: CourseProgress }>>(
      `/courses/${courseId}/progress`
    );
    return unwrap(res.data).progress;
  },

  /**
   * The caller's enrolled courses. The rows are paged; the summary always
   * describes the whole account, whichever page is asked for.
   */
  async myCourses(
    params: { page: number; limit: number } = { page: 1, limit: 20 }
  ): Promise<{
    courses: MyCourseProgress[];
    summary: ProgressSummary;
    pagination: Pagination;
  }> {
    const res = await api.get<
      ApiResponse<{ courses: MyCourseProgress[]; summary: ProgressSummary }>
    >("/progress/my-courses", { params });
    const { courses, summary } = unwrap(res.data);
    return {
      courses,
      summary,
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: courses.length,
          totalPages: 1,
        },
    };
  },
};
