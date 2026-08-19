import {
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  ScrollText,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lessonsService } from "@/services/lessons.service";
import { modulesService } from "@/services/modules.service";
import type { CourseModule, LessonSummary, LessonType } from "@/types";
import { formatDuration } from "@/utils/courseMeta";

const lessonTypeIcons: Record<LessonType, ComponentType<{ className?: string }>> = {
  video: Video,
  text: ScrollText,
  pdf: FileText,
  document: File,
};

interface CourseContentTreeProps {
  courseId: string;
  courseSlug: string;
}

/**
 * Read-only course content for students/visitors. The API already limits the
 * data to published modules and lessons.
 */
export const CourseContentTree = ({ courseId, courseSlug }: CourseContentTreeProps) => {
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonSummary[]>>({});
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const moduleList = await modulesService.listByCourse(courseId);
      const lessonLists = await Promise.all(
        moduleList.map((module) => lessonsService.listByModule(module.id))
      );
      setModules(moduleList);
      setLessonsByModule(
        Object.fromEntries(moduleList.map((module, i) => [module.id, lessonLists[i]]))
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (moduleId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  if (status === "loading") {
    return (
      <div className="space-y-3" aria-label="Loading course content">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8 text-center">
        <p className="font-medium">Unable to load course content.</p>
        <p className="mt-1 text-sm text-muted">Please try again.</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Course content is being prepared — check back soon.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {modules.map((module) => {
        const isOpen = !collapsed.has(module.id);
        const lessons = lessonsByModule[module.id] ?? [];
        return (
          <div key={module.id} className="rounded-xl border border-soft">
            <button
              type="button"
              onClick={() => toggle(module.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-2 p-3 text-left"
            >
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">{module.title}</span>
              <span className="text-xs whitespace-nowrap text-muted">
                {module.lessonCount} lesson{module.lessonCount === 1 ? "" : "s"}
              </span>
            </button>

            {isOpen && (
              <ul className="border-t border-soft px-3 py-1">
                {lessons.length === 0 && (
                  <li className="py-2.5 text-sm text-muted">No lessons published yet.</li>
                )}
                {lessons.map((lesson) => {
                  const TypeIcon = lessonTypeIcons[lesson.type];
                  return (
                    <li
                      key={lesson.id}
                      className="border-b border-soft last:border-0"
                    >
                      <Link
                        to={`/courses/${courseSlug}/lessons/${lesson.id}`}
                        className="flex items-center gap-2.5 py-2.5 text-sm hover:text-primary"
                      >
                        <TypeIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                        {lesson.isPreview && <Badge variant="amber">Preview</Badge>}
                        {lesson.duration ? (
                          <span className="text-xs whitespace-nowrap text-muted">
                            {formatDuration(lesson.duration)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
};
