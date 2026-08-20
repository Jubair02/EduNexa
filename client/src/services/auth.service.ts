import type {
  ApiResponse,
  AuthData,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  UpdateProfilePayload,
  User,
} from "@/types";
import { api, unwrap } from "./api";

export const authService = {
  async register(payload: RegisterPayload): Promise<AuthData> {
    const res = await api.post<ApiResponse<AuthData>>("/auth/register", payload);
    return unwrap(res.data);
  },

  async login(payload: LoginPayload): Promise<AuthData> {
    const res = await api.post<ApiResponse<AuthData>>("/auth/login", payload);
    return unwrap(res.data);
  },

  async me(): Promise<User> {
    const res = await api.get<ApiResponse<{ user: User }>>("/auth/me");
    return unwrap(res.data).user;
  },

  async logout(): Promise<void> {
    await api.post<ApiResponse>("/auth/logout");
  },

  /** Updates the signed-in user's own name and email. */
  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const res = await api.patch<ApiResponse<{ user: User }>>("/auth/me", payload);
    return unwrap(res.data).user;
  },

  /** Changes the signed-in user's own password; the session stays valid. */
  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await api.patch<ApiResponse>("/auth/me/password", payload);
  },
};
