import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  File,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LessonFormModal } from "@/components/courses/LessonFormModal";
import { ModuleFormModal } from "@/components/courses/ModuleFormModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { lessonsService } from "@/services/lessons.service";
import { modulesService } from "@/services/modules.service";
import type { CourseModule, Lesson, LessonSummary, LessonType } from "@/types";
import { formatDuration } from "@/utils/courseMeta";

const lessonTypeIcons: Record<LessonType, ComponentType<{ className?: string }>> = {
  video: Video,
  text: ScrollText,
  pdf: FileText,
  document: File,
};

type ConfirmAction =
  | { kind: "delete-module"; module: CourseModule }
  | { kind: "delete-lesson"; lesson: LessonSummary };

interface CourseContentManagerProps {
  courseId: string;
  /** Called after any change so the parent can refresh content statistics. */
  onContentChanged?: () => void;
}

/** Admin/instructor course-content tree: modules with nested lessons. */
export const CourseContentManager = ({
  courseId,
  onContentChanged,
}: CourseContentManagerProps) => {
  const { showToast } = useToast();

  const [modules, setModules] = useState<CourseModule[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonSummary[]>>({});

  const [moduleModal, setModuleModal] = useState<{ module: CourseModule | null } | null>(null);
  const [lessonModal, setLessonModal] = useState<{
    moduleId: string;
    lesson: Lesson | null;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const notifyChanged = useCallback(() => {
    onContentChanged?.();
  }, [onContentChanged]);

  const loadModules = useCallback(async () => {
    setStatus("loading");
    try {
      setModules(await modulesService.listByCourse(courseId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [courseId]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const loadLessons = useCallback(async (moduleId: string) => {
    try {
      const lessons = await lessonsService.listByModule(moduleId);
      setLessonsByModule((prev) => ({ ...prev, [moduleId]: lessons }));
    } catch {
      showToast("Unable to load this module's lessons.", "error");
    }
  }, [showToast]);

  const toggleExpanded = (moduleId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
        if (!lessonsByModule[moduleId]) {
          void loadLessons(moduleId);
        }
      }
      return next;
    });
  };

  const failToast = (error: unknown) => {
    showToast(
      error instanceof Error ? error.message : "The action failed. Please try again.",
      "error"
    );
  };

  const moveModule = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= modules.length) return;
    const ids = modules.map((module) => module.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      setModules(await modulesService.reorder(courseId, ids));
      showToast("Modules reordered");
    } catch (error) {
      failToast(error);
    }
  };

  const moveLesson = async (moduleId: string, index: number, direction: -1 | 1) => {
    const lessons = lessonsByModule[moduleId] ?? [];
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const ids = lessons.map((lesson) => lesson.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      const updated = await lessonsService.reorder(moduleId, ids);
      setLessonsByModule((prev) => ({ ...prev, [moduleId]: updated }));
      showToast("Lessons reordered");
    } catch (error) {
      failToast(error);
    }
  };

  const toggleModulePublished = async (module: CourseModule) => {
    try {
      const updated = await modulesService.setStatus(module.id, !module.isPublished);
      setModules((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast(updated.isPublished ? "Module published" : "Module unpublished");
      notifyChanged();
    } catch (error) {
      failToast(error);
    }
  };

  const toggleLessonPublished = async (lesson: LessonSummary) => {
    try {
      const updated = await lessonsService.setStatus(lesson.id, !lesson.isPublished);
      setLessonsByModule((prev) => ({
        ...prev,
        [lesson.module]: (prev[lesson.module] ?? []).map((l) =>
          l.id === updated.id ? updated : l
        ),
      }));
      showToast(updated.isPublished ? "Lesson published" : "Lesson unpublished");
      notifyChanged();
    } catch (error) {
      failToast(error);
    }
  };

  const openEditLesson = async (lesson: LessonSummary) => {
    try {
      const { lesson: full } = await lessonsService.get(lesson.id);
      setLessonModal({ moduleId: lesson.module, lesson: full });
    } catch (error) {
      failToast(error);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setIsActionLoading(true);
    try {
      if (confirmAction.kind === "delete-module") {
        await modulesService.remove(confirmAction.module.id);
        showToast("Module deleted");
        await loadModules();
      } else {
        const { lesson } = confirmAction;
        await lessonsService.remove(lesson.id);
        showToast("Lesson deleted");
        await loadLessons(lesson.module);
        setModules((prev) =>
          prev.map((m) =>
            m.id === lesson.module ? { ...m, lessonCount: m.lessonCount - 1 } : m
          )
        );
      }
      setConfirmAction(null);
      notifyChanged();
    } catch (error) {
      failToast(error);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleModuleSaved = (saved: CourseModule, mode: "created" | "updated") => {
    setModuleModal(null);
    showToast(mode === "created" ? "Module created" : "Module updated");
    void loadModules();
    notifyChanged();
    void saved;
  };

  const handleLessonSaved = (saved: Lesson, mode: "created" | "updated") => {
    const moduleId = saved.module;
    setLessonModal(null);
    showToast(mode === "created" ? "Lesson created" : "Lesson updated");
    void loadLessons(moduleId);
    void loadModules();
    setExpanded((prev) => new Set(prev).add(moduleId));
    notifyChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">Course Content</CardTitle>
        <Button size="sm" onClick={() => setModuleModal({ module: null })}>
          <Plus className="size-4" aria-hidden="true" />
          Add module
        </Button>
      </CardHeader>

      <CardContent className="space-y-3 pb-6">
        {status === "loading" && (
          <div className="space-y-3" aria-label="Loading course content">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="py-10 text-center">
            <p className="font-medium">Unable to load course content.</p>
            <p className="mt-1 text-sm text-muted">Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => void loadModules()}>
              Retry
            </Button>
          </div>
        )}

        {status === "ready" && modules.length === 0 && (
          <div className="py-10 text-center">
            <p className="font-medium">This course has no modules yet.</p>
            <p className="mt-1 text-sm text-muted">
              Add your first module to start building the course.
            </p>
          </div>
        )}

        {status === "ready" &&
          modules.map((module, moduleIndex) => {
            const isOpen = expanded.has(module.id);
            const lessons = lessonsByModule[module.id];
            return (
              <div key={module.id} className="rounded-xl border border-soft">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(module.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Collapse" : "Expand"} module ${module.title}`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    )}
                    <span className="truncate font-medium">
                      {module.order}. {module.title}
                    </span>
                    <span className="text-xs whitespace-nowrap text-muted">
                      {module.lessonCount} lesson{module.lessonCount === 1 ? "" : "s"}
                    </span>
                    <Badge variant={module.isPublished ? "success" : "muted"}>
                      {module.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </button>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void moveModule(moduleIndex, -1)}
                      disabled={moduleIndex === 0}
                      aria-label={`Move module ${module.title} up`}
                      className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveModule(moduleIndex, 1)}
                      disabled={moduleIndex === modules.length - 1}
                      aria-label={`Move module ${module.title} down`}
                      className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleModulePublished(module)}
                      aria-label={`${module.isPublished ? "Unpublish" : "Publish"} module ${module.title}`}
                      className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink"
                    >
                      {module.isPublished ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModuleModal({ module })}
                      aria-label={`Edit module ${module.title}`}
                      className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ kind: "delete-module", module })}
                      aria-label={`Delete module ${module.title}`}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-soft px-3 py-2">
                    {!lessons && <Skeleton className="my-2 h-10 w-full" />}

                    {lessons && lessons.length === 0 && (
                      <p className="py-3 text-center text-sm text-muted">
                        This module has no lessons yet. Add a lesson to continue.
                      </p>
                    )}

                    {lessons &&
                      lessons.map((lesson, lessonIndex) => {
                        const TypeIcon = lessonTypeIcons[lesson.type];
                        return (
                          <div
                            key={lesson.id}
                            className="flex flex-wrap items-center gap-2 border-b border-soft py-2 last:border-0"
                          >
                            <TypeIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {lesson.order}. {lesson.title}
                            </span>
                            {lesson.duration ? (
                              <span className="text-xs whitespace-nowrap text-muted">
                                {formatDuration(lesson.duration)}
                              </span>
                            ) : null}
                            {lesson.isPreview && <Badge variant="amber">Preview</Badge>}
                            <Badge variant={lesson.isPublished ? "success" : "muted"}>
                              {lesson.isPublished ? "Published" : "Draft"}
                            </Badge>

                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => void moveLesson(module.id, lessonIndex, -1)}
                                disabled={lessonIndex === 0}
                                aria-label={`Move lesson ${lesson.title} up`}
                                className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink disabled:opacity-30"
                              >
                                <ChevronUp className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void moveLesson(module.id, lessonIndex, 1)}
                                disabled={lessonIndex === lessons.length - 1}
                                aria-label={`Move lesson ${lesson.title} down`}
                                className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink disabled:opacity-30"
                              >
                                <ChevronDown className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleLessonPublished(lesson)}
                                aria-label={`${lesson.isPublished ? "Unpublish" : "Publish"} lesson ${lesson.title}`}
                                className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink"
                              >
                                {lesson.isPublished ? (
                                  <EyeOff className="size-4" aria-hidden="true" />
                                ) : (
                                  <Eye className="size-4" aria-hidden="true" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => void openEditLesson(lesson)}
                                aria-label={`Edit lesson ${lesson.title}`}
                                className="rounded-lg p-1.5 text-muted hover:bg-primary-soft hover:text-ink"
                              >
                                <Pencil className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({ kind: "delete-lesson", lesson })
                                }
                                aria-label={`Delete lesson ${lesson.title}`}
                                className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                    <div className="py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLessonModal({ moduleId: module.id, lesson: null })}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        Add lesson
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </CardContent>

      {moduleModal && (
        <ModuleFormModal
          key={moduleModal.module?.id ?? "create"}
          courseId={courseId}
          module={moduleModal.module}
          onClose={() => setModuleModal(null)}
          onSaved={handleModuleSaved}
        />
      )}

      {lessonModal && (
        <LessonFormModal
          key={lessonModal.lesson?.id ?? "create"}
          moduleId={lessonModal.moduleId}
          lesson={lessonModal.lesson}
          onClose={() => setLessonModal(null)}
          onSaved={handleLessonSaved}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          open
          title={
            confirmAction.kind === "delete-module" ? "Delete module" : "Delete lesson"
          }
          message={
            confirmAction.kind === "delete-module"
              ? `Are you sure you want to delete "${confirmAction.module.title}"?\n\nModules that still contain lessons cannot be deleted.`
              : `Are you sure you want to delete "${confirmAction.lesson.title}"?\n\nThis action cannot be undone.`
          }
          confirmLabel={
            confirmAction.kind === "delete-module" ? "Delete module" : "Delete lesson"
          }
          isLoading={isActionLoading}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </Card>
  );
};
