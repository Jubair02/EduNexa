import { Request, Response } from "express";
import { Viewer } from "../services/courses.service";
import * as modulesService from "../services/modules.service";
import { ApiError } from "../utils/ApiError";

const viewerOrNull = (req: Request): Viewer | null =>
  req.user ? { id: req.user._id.toString(), role: req.user.role } : null;

const requireViewer = (req: Request): Viewer => {
  const viewer = viewerOrNull(req);
  if (!viewer) {
    throw ApiError.unauthorized();
  }
  return viewer;
};

// Express 5 types route params as string | string[].
const param = (req: Request, name: string): string => {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
};

export const listModules = async (req: Request, res: Response): Promise<void> => {
  const modules = await modulesService.listModules(
    param(req, "courseId"),
    viewerOrNull(req)
  );
  res.status(200).json({ success: true, message: "Modules retrieved", data: modules });
};

export const getModule = async (req: Request, res: Response): Promise<void> => {
  const module = await modulesService.getModule(param(req, "id"), viewerOrNull(req));
  res.status(200).json({ success: true, message: "Module retrieved", data: { module } });
};

export const createModule = async (req: Request, res: Response): Promise<void> => {
  const module = await modulesService.createModule(
    param(req, "courseId"),
    req.body,
    requireViewer(req)
  );
  res.status(201).json({ success: true, message: "Module created", data: { module } });
};

export const updateModule = async (req: Request, res: Response): Promise<void> => {
  const module = await modulesService.updateModule(
    param(req, "id"),
    req.body,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Module updated", data: { module } });
};

export const deleteModule = async (req: Request, res: Response): Promise<void> => {
  await modulesService.deleteModule(param(req, "id"), requireViewer(req));
  res.status(200).json({ success: true, message: "Module deleted" });
};

export const setModuleStatus = async (req: Request, res: Response): Promise<void> => {
  const { isPublished } = req.body as { isPublished: boolean };
  const module = await modulesService.setModuleStatus(
    param(req, "id"),
    isPublished,
    requireViewer(req)
  );
  res.status(200).json({
    success: true,
    message: isPublished ? "Module published" : "Module unpublished",
    data: { module },
  });
};

export const reorderModules = async (req: Request, res: Response): Promise<void> => {
  const { moduleIds } = req.body as { moduleIds: string[] };
  const modules = await modulesService.reorderModules(
    param(req, "courseId"),
    moduleIds,
    requireViewer(req)
  );
  res.status(200).json({ success: true, message: "Modules reordered", data: modules });
};
