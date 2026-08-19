import type { ApiResponse, CourseModule, ModulePayload } from "@/types";
import { api, unwrap } from "./api";

export const modulesService = {
  async listByCourse(courseId: string): Promise<CourseModule[]> {
    const res = await api.get<ApiResponse<CourseModule[]>>(
      `/courses/${courseId}/modules`
    );
    return res.data.data ?? [];
  },

  async create(courseId: string, payload: ModulePayload): Promise<CourseModule> {
    const res = await api.post<ApiResponse<{ module: CourseModule }>>(
      `/courses/${courseId}/modules`,
      payload
    );
    return unwrap(res.data).module;
  },

  async update(id: string, payload: ModulePayload): Promise<CourseModule> {
    const res = await api.put<ApiResponse<{ module: CourseModule }>>(
      `/modules/${id}`,
      payload
    );
    return unwrap(res.data).module;
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse>(`/modules/${id}`);
  },

  async setStatus(id: string, isPublished: boolean): Promise<CourseModule> {
    const res = await api.patch<ApiResponse<{ module: CourseModule }>>(
      `/modules/${id}/status`,
      { isPublished }
    );
    return unwrap(res.data).module;
  },

  async reorder(courseId: string, moduleIds: string[]): Promise<CourseModule[]> {
    const res = await api.patch<ApiResponse<CourseModule[]>>(
      `/courses/${courseId}/modules/reorder`,
      { moduleIds }
    );
    return res.data.data ?? [];
  },
};
