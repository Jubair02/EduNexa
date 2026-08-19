import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CourseForm } from "@/components/courses/CourseForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { coursesService } from "@/services/courses.service";
import type { Course } from "@/types";

interface ManageCourseFormPageProps {
  variant: "admin" | "instructor";
  mode: "create" | "edit";
}

/** Shared create/edit page behind /admin/courses/... and /instructor/courses/... */
export const ManageCourseFormPage = ({ variant, mode }: ManageCourseFormPageProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const basePath = variant === "admin" ? "/admin/courses" : "/instructor/courses";

  const [course, setCourse] = useState<Course | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    mode === "edit" ? "loading" : "ready"
  );

  const load = useCallback(async () => {
    if (mode !== "edit" || !id) return;
    setStatus("loading");
    try {
      setCourse(await coursesService.get(id));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [mode, id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={basePath}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to courses
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "Create course" : "Edit course"}</CardTitle>
          <CardDescription>
            {mode === "create"
              ? "New courses start as drafts — publish when they're ready."
              : "Changes are saved immediately; the course URL stays the same."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {status === "loading" && (
            <div className="space-y-4">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {status === "error" && (
            <div className="py-8 text-center">
              <p className="font-medium">Unable to load this course.</p>
              <p className="mt-1 text-sm text-muted">
                It may have been deleted, or you may not have access to it.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          )}

          {status === "ready" && (
            <CourseForm
              key={course?.id ?? "create"}
              course={course}
              variant={variant}
              onCancel={() => navigate(basePath)}
              onSaved={(saved, savedMode) => {
                showToast(savedMode === "created" ? "Course created" : "Course updated");
                navigate(`${basePath}/${saved.id}`);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
