import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LessonContent } from "@/components/courses/LessonContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { ApiRequestError } from "@/services/api";
import { lessonsService } from "@/services/lessons.service";
import { progressService } from "@/services/progress.service";
import type { Lesson, LessonContext } from "@/types";
import { formatDuration } from "@/utils/courseMeta";

type LoadStatus = "loading" | "error" | "forbidden" | "ready";

export const LessonViewerPage = () => {
  const { slug, lessonId } = useParams<{ slug: string; lessonId: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  // A plain identifier, so the memoized loader has a dependency that both the
  // linter and the React Compiler can track.
  const role = user?.role;
  const [data, setData] = useState<{ lesson: Lesson; context: LessonContext } | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  /** null while unknown — the control only appears once the API confirms access. */
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [isSavingProgress, setIsSavingProgress] = useState(false);

  const load = useCallback(async () => {
    if (!lessonId) return;
    setStatus("loading");
    setIsCompleted(null);
    try {
      setData(await lessonsService.get(lessonId));
      setStatus("ready");
      window.scrollTo({ top: 0 });

      // Progress only exists for actively enrolled students; a rejection here
      // simply means this viewer can't track it (preview lesson, staff, guest).
      if (role === "student") {
        try {
          const progress = await progressService.getLessonProgress(lessonId);
          setIsCompleted(progress.isCompleted);
        } catch {
          setIsCompleted(null);
        }
      }
    } catch (error) {
      setStatus(
        error instanceof ApiRequestError && error.status === 403 ? "forbidden" : "error"
      );
    }
  }, [lessonId, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleComplete = async (next: boolean) => {
    if (!lessonId) return;
    setIsSavingProgress(true);
    try {
      const response = await progressService.setLessonProgress(lessonId, next);
      setIsCompleted(response.progress.isCompleted);
      showToast(next ? "Lesson marked complete" : "Lesson marked incomplete");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Couldn't save your progress.",
        "error"
      );
    } finally {
      setIsSavingProgress(false);
    }
  };

  const backToCourse = `/courses/${slug ?? data?.context.courseSlug ?? ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={backToCourse}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to course
      </Link>

      {status === "loading" && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      )}

      {status === "forbidden" && (
        <Card>
          <CardContent className="py-16 text-center">
            <Lock className="mx-auto size-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-medium">
              You need to enroll in this course to access this lesson.
            </p>
            <p className="mt-1 text-sm text-muted">
              Preview lessons stay free — enroll to unlock everything else.
            </p>
            <Link to={backToCourse}>
              <Button className="mt-4">Go to course page</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium">This lesson isn't available.</p>
            <p className="mt-1 text-sm text-muted">
              It may have been unpublished or removed.
            </p>
            <Link to={backToCourse}>
              <Button variant="outline" className="mt-4">
                Back to course
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "ready" && data && (
        <Card>
          <CardContent className="space-y-5 py-6">
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">
                {data.context.courseTitle} · {data.context.moduleTitle}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold">
                  {data.lesson.title}
                </h1>
                {isCompleted === true && (
                  <Badge variant="success">
                    <Check className="mr-1 inline size-3" aria-hidden="true" />
                    Completed
                  </Badge>
                )}
                {data.lesson.isPreview && <Badge variant="amber">Preview</Badge>}
                {data.lesson.duration ? (
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <Clock className="size-4" aria-hidden="true" />
                    {formatDuration(data.lesson.duration)}
                  </span>
                ) : null}
              </div>
              {data.lesson.description && (
                <p className="mt-2 text-sm text-muted">{data.lesson.description}</p>
              )}
            </div>

            <LessonContent lesson={data.lesson} />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-5">
              {data.context.previousLessonId ? (
                <Link to={`/courses/${data.context.courseSlug}/lessons/${data.context.previousLessonId}`}>
                  <Button variant="outline" size="sm">
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Previous lesson
                  </Button>
                </Link>
              ) : (
                <span />
              )}

              {isCompleted !== null &&
                (isCompleted ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleComplete(false)}
                    isLoading={isSavingProgress}
                  >
                    <Undo2 className="size-4" aria-hidden="true" />
                    Mark as Incomplete
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void toggleComplete(true)}
                    isLoading={isSavingProgress}
                  >
                    <Check className="size-4" aria-hidden="true" />
                    Mark as Complete
                  </Button>
                ))}

              {data.context.nextLessonId ? (
                <Link to={`/courses/${data.context.courseSlug}/lessons/${data.context.nextLessonId}`}>
                  <Button variant="outline" size="sm">
                    Next lesson
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </Link>
              ) : (
                <span />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
