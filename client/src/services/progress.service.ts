import type {
  ApiResponse,
  CourseProgress,
  LessonProgressState,
  MyCourseProgress,
  ProgressSummary,
} from "@/types";
import { api, unwrap } from "./api";

interface LessonProgressResponse {
  progress: LessonProgressState;
  courseProgress: CourseProgress;
}

export const progressService = {
  /** Marks a lesson complete; returns the lesson state and fresh course totals. */
  async completeLesson(lessonId: string): Promise<LessonProgressResponse> {
    const res = await api.post<ApiResponse<LessonProgressResponse>>(
      `/lessons/${lessonId}/complete`
    );
    return unwrap(res.data);
  },

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

  async myCourses(): Promise<{
    courses: MyCourseProgress[];
    summary: ProgressSummary;
  }> {
    const res = await api.get<
      ApiResponse<{ courses: MyCourseProgress[]; summary: ProgressSummary }>
    >("/progress/my-courses");
    return unwrap(res.data);
  },
};
