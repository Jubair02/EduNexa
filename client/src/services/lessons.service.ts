import type {
  ApiResponse,
  Lesson,
  LessonContext,
  LessonPayload,
  LessonSummary,
} from "@/types";
import { api, unwrap } from "./api";

export const lessonsService = {
  async listByModule(moduleId: string): Promise<LessonSummary[]> {
    const res = await api.get<ApiResponse<LessonSummary[]>>(
      `/modules/${moduleId}/lessons`
    );
    return res.data.data ?? [];
  },

  async get(id: string): Promise<{ lesson: Lesson; context: LessonContext }> {
    const res = await api.get<ApiResponse<{ lesson: Lesson; context: LessonContext }>>(
      `/lessons/${id}`
    );
    return unwrap(res.data);
  },

  async create(moduleId: string, payload: LessonPayload): Promise<Lesson> {
    const res = await api.post<ApiResponse<{ lesson: Lesson }>>(
      `/modules/${moduleId}/lessons`,
      payload
    );
    return unwrap(res.data).lesson;
  },

  async update(id: string, payload: Partial<LessonPayload>): Promise<Lesson> {
    const res = await api.put<ApiResponse<{ lesson: Lesson }>>(
      `/lessons/${id}`,
      payload
    );
    return unwrap(res.data).lesson;
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse>(`/lessons/${id}`);
  },

  async setStatus(id: string, isPublished: boolean): Promise<Lesson> {
    const res = await api.patch<ApiResponse<{ lesson: Lesson }>>(
      `/lessons/${id}/status`,
      { isPublished }
    );
    return unwrap(res.data).lesson;
  },

  async reorder(moduleId: string, lessonIds: string[]): Promise<LessonSummary[]> {
    const res = await api.patch<ApiResponse<LessonSummary[]>>(
      `/modules/${moduleId}/lessons/reorder`,
      { lessonIds }
    );
    return res.data.data ?? [];
  },
};
