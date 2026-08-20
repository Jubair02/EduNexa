import { Request, Response } from "express";
import * as notificationsService from "../services/notifications.service";
import { requireViewer } from "../utils/requestContext";

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  const feed = await notificationsService.getNotifications(requireViewer(req));
  res.status(200).json({
    success: true,
    message: "Notifications retrieved",
    data: feed,
  });
};

export const markSeen = async (req: Request, res: Response): Promise<void> => {
  const seenAt = await notificationsService.markNotificationsSeen(requireViewer(req));
  res.status(200).json({
    success: true,
    message: "Notifications marked as seen",
    data: { seenAt },
  });
};
