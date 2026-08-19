import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { QuizBuilderModal } from "@/components/quizzes/QuizBuilderModal";
import { QuizResultsModal } from "@/components/quizzes/QuizResultsModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { coursesService } from "@/services/courses.service";
import { quizzesService } from "@/services/quizzes.service";
import type { Course, Quiz } from "@/types";

type LoadStatus = "loading" | "error" | "ready";

/** Quiz management for /admin/courses/:courseId/quizzes and the instructor twin. */
export const QuizManagementPage = ({ variant }: { variant: "admin" | "instructor" }) => {
  const { courseId } = useParams<{ courseId: string }>();
  const { showToast } = useToast();
  const basePath = variant === "admin" ? "/admin/courses" : "/instructor/courses";

  const [course, setCourse] = useState<Course | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [builderFor, setBuilderFor] = useState<{ quiz: Quiz | null } | null>(null);
  const [resultsFor, setResultsFor] = useState<Quiz | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setStatus("loading");
    try {
      const [loadedCourse, loadedQuizzes] = await Promise.all([
        coursesService.get(courseId),
        quizzesService.listByCourse(courseId),
      ]);
      setCourse(loadedCourse);
      setQuizzes(loadedQuizzes);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const failToast = (error: unknown) => {
    showToast(
      error instanceof Error ? error.message : "The action failed. Please try again.",
      "error"
    );
  };

  const togglePublished = async (quiz: Quiz) => {
    try {
      const updated = await quizzesService.setStatus(quiz.id, !quiz.isPublished);
      setQuizzes((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry))
      );
      showToast(updated.isPublished ? "Quiz published" : "Quiz unpublished");
    } catch (error) {
      failToast(error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await quizzesService.remove(deleteTarget.id);
      showToast("Quiz deleted");
      setDeleteTarget(null);
      await load();
    } catch (error) {
      failToast(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={courseId ? `${basePath}/${courseId}` : basePath}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to course
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Quizzes</h1>
            <p className="mt-1 text-muted">
              {course ? course.title : "Loading course…"}
            </p>
          </div>
          <Button onClick={() => setBuilderFor({ quiz: null })} disabled={!courseId}>
            <Plus className="size-4" aria-hidden="true" />
            Create quiz
          </Button>
        </div>
      </div>

      {status === "loading" && (
        <div className="space-y-3" aria-label="Loading quizzes">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {status === "error" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Unable to load quizzes.</p>
            <p className="mt-1 text-sm text-muted">Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" && quizzes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="mx-auto size-8 text-muted" aria-hidden="true" />
            <p className="mt-3 font-medium">This course has no quizzes yet.</p>
            <p className="mt-1 text-sm text-muted">
              Build your first quiz — it stays unpublished until you're ready.
            </p>
            <Button className="mt-4" onClick={() => setBuilderFor({ quiz: null })}>
              <Plus className="size-4" aria-hidden="true" />
              Create quiz
            </Button>
          </CardContent>
        </Card>
      )}

      {status === "ready" &&
        quizzes.map((quiz) => (
          <Card key={quiz.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-lg font-semibold">{quiz.title}</h2>
                  <Badge variant={quiz.isPublished ? "success" : "muted"}>
                    {quiz.isPublished ? "Published" : "Draft"}
                  </Badge>
                  <Badge variant={quiz.isRequired ? "primary" : "muted"}>
                    {quiz.isRequired ? "Required" : "Optional"}
                  </Badge>
                </div>
                {quiz.description && (
                  <p className="mt-1 text-sm text-muted">{quiz.description}</p>
                )}
                <p className="mt-2 text-sm text-muted">
                  {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"} ·{" "}
                  {quiz.totalPoints} point{quiz.totalPoints === 1 ? "" : "s"} · pass at{" "}
                  {quiz.passingScore}%
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setResultsFor(quiz)}
                  aria-label={`View results for ${quiz.title}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-primary-soft hover:text-ink"
                >
                  <BarChart3 className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderFor({ quiz })}
                  aria-label={`Edit ${quiz.title}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-primary-soft hover:text-ink"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void togglePublished(quiz)}
                  aria-label={`${quiz.isPublished ? "Unpublish" : "Publish"} ${quiz.title}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-primary-soft hover:text-ink"
                >
                  {quiz.isPublished ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(quiz)}
                  aria-label={`Delete ${quiz.title}`}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}

      {builderFor && courseId && (
        <QuizBuilderModal
          key={builderFor.quiz?.id ?? "create"}
          courseId={courseId}
          quiz={builderFor.quiz}
          onClose={() => setBuilderFor(null)}
          onSaved={(saved, mode) => {
            setBuilderFor(null);
            showToast(mode === "created" ? "Quiz created" : "Quiz updated");
            void load();
            void saved;
          }}
        />
      )}

      {resultsFor && (
        <QuizResultsModal quiz={resultsFor} onClose={() => setResultsFor(null)} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title="Delete quiz"
          message={`Are you sure you want to delete "${deleteTarget.title}"?\n\nQuizzes that students have already attempted cannot be deleted — unpublish them instead.`}
          confirmLabel="Delete quiz"
          isLoading={isDeleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};
