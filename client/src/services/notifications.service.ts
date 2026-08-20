import type { ApiResponse, NotificationFeed } from "@/types";
import { api, unwrap } from "./api";

export const notificationsService = {
  /** The caller's feed, newest first, with unread derived from their last visit. */
  async list(): Promise<NotificationFeed> {
    const res = await api.get<ApiResponse<NotificationFeed>>("/notifications");
    return unwrap(res.data);
  },

  /** Stamps "seen now", which clears the unread badge. */
  async markSeen(): Promise<void> {
    await api.post<ApiResponse>("/notifications/seen");
  },
};
