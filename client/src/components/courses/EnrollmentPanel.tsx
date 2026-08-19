import { GraduationCap, PlayCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { enrollmentsService } from "@/services/enrollments.service";
import type { EnrollmentCheck } from "@/types";

interface EnrollmentPanelProps {
  courseId: string;
}

/**
 * Enrollment state and actions on the public course page. Rendered for
 * students (enroll / continue / re-enroll) and visitors (sign-in prompt);
 * admins and instructors see nothing.
 */
export const EnrollmentPanel = ({ courseId }: EnrollmentPanelProps) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [check, setCheck] = useState<EnrollmentCheck | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const isStudent = user?.role === "student";

  const load = useCallback(async () => {
    if (!isStudent) return;
    setStatus("loading");
    try {
      setCheck(await enrollmentsService.check(courseId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [courseId, isStudent]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      const enrollment = await enrollmentsService.enroll(courseId);
      setCheck({ isEnrolled: true, enrollmentId: enrollment.id, status: "active" });
      setConfirmOpen(false);
      showToast("Successfully enrolled in course");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Enrollment failed. Please try again.",
        "error"
      );
    } finally {
      setIsEnrolling(false);
    }
  };

  if (isAuthLoading) return null;

  // Visitors: prompt to sign in as the enrollment entry point.
  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soft bg-paper p-4">
        <p className="text-sm text-muted">Sign in as a student to enroll in this course.</p>
        <Button onClick={() => navigate("/login")}>Sign in to enroll</Button>
      </div>
    );
  }

  if (!isStudent) return null;

  if (status === "loading") {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  if (status === "error") {
    return (
      <Alert variant="error">
        <div className="flex flex-wrap items-center gap-3">
          <span>Unable to check your enrollment. Please try again.</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (check?.isEnrolled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-4">
        <p className="text-sm font-medium text-success">
          You are enrolled in this course.
        </p>
        <Link to={`/student/courses/${courseId}/learn`}>
          <Button>
            <PlayCircle className="size-4" aria-hidden="true" />
            Continue Learning
          </Button>
        </Link>
      </div>
    );
  }

  if (check?.status === "cancelled") {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soft bg-paper p-4">
          <p className="text-sm text-muted">Your enrollment is cancelled.</p>
          <Button onClick={() => setConfirmOpen(true)} isLoading={isEnrolling}>
            Re-enroll
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Re-enroll in this course?"
          message="Your previous enrollment will be reactivated and you will regain access to the available course content."
          confirmLabel="Confirm Enrollment"
          isLoading={isEnrolling}
          onConfirm={() => void handleEnroll()}
          onCancel={() => setConfirmOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-soft bg-paper p-4">
        <p className="text-sm text-muted">
          Enroll to unlock all published lessons in this course.
        </p>
        <Button onClick={() => setConfirmOpen(true)} isLoading={isEnrolling}>
          <GraduationCap className="size-4" aria-hidden="true" />
          {isEnrolling ? "Enrolling…" : "Enroll Now"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Enroll in this course?"
        message="You will get access to the available course content after enrollment."
        confirmLabel="Confirm Enrollment"
        isLoading={isEnrolling}
        onConfirm={() => void handleEnroll()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};
