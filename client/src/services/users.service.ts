import type {
  ApiResponse,
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UserListParams,
  UserListResult,
  UserStatistics,
} from "@/types";
import { api, unwrap } from "./api";

export const usersService = {
  async list(params: UserListParams): Promise<UserListResult> {
    const query: Record<string, string | number> = {
      page: params.page,
      limit: params.limit,
    };
    if (params.search.trim()) query.search = params.search.trim();
    if (params.role) query.role = params.role;
    if (params.status) query.status = params.status;

    const res = await api.get<ApiResponse<User[]>>("/users", { params: query });
    return {
      users: res.data.data ?? [],
      pagination:
        res.data.pagination ?? {
          page: params.page,
          limit: params.limit,
          total: 0,
          totalPages: 0,
        },
    };
  },

  async get(id: string): Promise<User> {
    const res = await api.get<ApiResponse<{ user: User }>>(`/users/${id}`);
    return unwrap(res.data).user;
  },

  async create(payload: CreateUserPayload): Promise<User> {
    const res = await api.post<ApiResponse<{ user: User }>>("/users", payload);
    return unwrap(res.data).user;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const res = await api.put<ApiResponse<{ user: User }>>(`/users/${id}`, payload);
    return unwrap(res.data).user;
  },

  async setStatus(id: string, isActive: boolean): Promise<User> {
    const res = await api.patch<ApiResponse<{ user: User }>>(`/users/${id}/status`, {
      isActive,
    });
    return unwrap(res.data).user;
  },

  async remove(id: string): Promise<void> {
    await api.delete<ApiResponse>(`/users/${id}`);
  },

  async statistics(): Promise<UserStatistics> {
    const res = await api.get<ApiResponse<UserStatistics>>("/users/statistics");
    return unwrap(res.data);
  },

  async recent(): Promise<User[]> {
    const res = await api.get<ApiResponse<User[]>>("/users/recent");
    return res.data.data ?? [];
  },
};
