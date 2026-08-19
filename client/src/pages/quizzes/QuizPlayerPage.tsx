import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardList,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { quizzesService } from "@/services/quizzes.service";
import type { AttemptResult, MyQuizResults, Quiz } from "@/types";
import { cn } from "@/utils/cn";

type LoadStatus = "loading" | "error" | "ready";

export const QuizPlayerPage = () => {
  const { courseId, quizId } = useParams<{ courseId: string; quizId: string }>();
  const { showToast } = useToast();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [history, setHistory] = useState<MyQuizResults | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const load = useCallback(async () => {
    if (!quizId) return;
    setStatus("loading");
    try {
      const [loadedQuiz, loadedHistory] = await Promise.all([
        quizzesService.get(quizId),
        quizzesService.myResults(quizId),
      ]);
      setQuiz(loadedQuiz);
      setHistory(loadedHistory);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const select = (questionId: string, value: string) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setValidationError(null);
  };

  const requestSubmit = () => {
    if (!quiz) return;
    const unanswered = quiz.questions.filter((question) => !answers[question.id]);
    if (unanswered.length > 0) {
      setValidationError(
        `Answer every question before submitting — ${unanswered.length} left.`
      );
      return;
    }
    setValidationError(null);
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!quiz || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { result: submitted } = await quizzesService.submit(
        quiz.id,
        Object.entries(answers).map(([questionId, selectedAnswer]) => ({
          questionId,
          selectedAnswer,
        }))
      );
      setResult(submitted);
      setConfirmOpen(false);
      showToast(
        submitted.passed
          ? `Passed with ${submitted.percentage}%`
          : `Scored ${submitted.percentage}% — keep going`,
        submitted.passed ? "success" : "error"
      );
      setHistory(await quizzesService.myResults(quiz.id));
    } catch (error) {
      setConfirmOpen(false);
      showToast(
        error instanceof Error ? error.message : "Submission failed. Please try again.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const retry = () => {
    setAnswers({});
    setResult(null);
    setValidationError(null);
  };

  const backToCourse = courseId ? `/student/courses/${courseId}/learn` : "/student/courses";

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (status === "error" || !quiz) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium">This quiz isn't available.</p>
            <p className="mt-1 text-sm text-muted">
              It may be unpublished, or you may need an active enrollment.
            </p>
            <Link to={backToCourse}>
              <Button variant="outline" className="mt-4">
                Back to course
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const answeredCount = quiz.questions.filter((question) => answers[question.id]).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={backToCourse}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to course
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{quiz.title}</CardTitle>
              {quiz.description && (
                <p className="mt-1 text-sm text-muted">{quiz.description}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={quiz.isRequired ? "primary" : "muted"}>
                {quiz.isRequired ? "Required" : "Optional"}
              </Badge>
              {history?.passed && <Badge variant="success">Passed</Badge>}
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">
            {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"} ·{" "}
            {quiz.totalPoints} point{quiz.totalPoints === 1 ? "" : "s"} · pass at{" "}
            {quiz.passingScore}%
          </p>
        </CardHeader>
      </Card>

      {/* Result of the attempt just submitted */}
      {result && (
        <Card
          className={cn(
            "border-2",
            result.passed ? "border-success/40" : "border-danger/40"
          )}
        >
          <CardContent className="py-6 text-center">
            {result.passed ? (
              <Award className="mx-auto size-10 text-success" aria-hidden="true" />
            ) : (
              <XCircle className="mx-auto size-10 text-danger" aria-hidden="true" />
            )}
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums">
              {result.percentage}%
            </p>
            <p className="mt-1 text-sm text-muted">
              {result.score} of {result.totalPoints} points ·{" "}
              {result.passed
                ? "you passed this quiz"
                : `you need ${quiz.passingScore}% to pass`}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Try again
              </Button>
              <Link to={backToCourse}>
                <Button>Back to course</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question paper — hidden while a fresh result is on screen */}
      {!result && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">Questions</CardTitle>
            <p className="text-sm text-muted" aria-live="polite">
              {answeredCount} of {quiz.questions.length} answered
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pb-6">
            {history && history.attemptCount > 0 && (
              <Alert variant={history.passed ? "success" : "error"}>
                {history.passed
                  ? `You've already passed this quiz with ${history.bestPercentage}%. Attempts stay on your record.`
                  : `Best score so far: ${history.bestPercentage}%. You can attempt this quiz again.`}
              </Alert>
            )}

            {validationError && <Alert variant="error">{validationError}</Alert>}

            <ol className="space-y-5">
              {quiz.questions.map((question, index) => (
                <li key={question.id}>
                  <fieldset>
                    <legend className="text-sm font-medium">
                      <span className="text-muted">{index + 1}.</span>{" "}
                      {question.questionText}
                      <span className="ml-2 text-xs text-muted">
                        ({question.points} point{question.points === 1 ? "" : "s"})
                      </span>
                    </legend>
                    <div className="mt-2 space-y-2">
                      {question.options.map((option) => {
                        const checked = answers[question.id] === option;
                        return (
                          <label
                            key={option}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                              checked
                                ? "border-primary bg-primary-soft"
                                : "border-soft hover:bg-paper"
                            )}
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={option}
                              checked={checked}
                              onChange={() => select(question.id, option)}
                              className="size-4 accent-primary"
                            />
                            <span
                              className={cn(
                                question.type === "true-false" && "capitalize"
                              )}
                            >
                              {option}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap justify-end gap-3 border-t border-soft pt-5">
              <Link to={backToCourse}>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </Link>
              <Button onClick={requestSubmit} isLoading={isSubmitting}>
                Submit quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attempt history */}
      {history && history.attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attempt history</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <ul className="divide-y divide-soft">
              {history.attempts.map((attempt, index) => (
                <li
                  key={attempt.attemptId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm">
                    {attempt.passed ? (
                      <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    ) : (
                      <ClipboardList className="size-4 text-muted" aria-hidden="true" />
                    )}
                    Attempt {history.attempts.length - index}
                  </span>
                  <span className="text-sm tabular-nums">
                    {attempt.score}/{attempt.totalPoints}{" "}
                    <span className="text-muted">({attempt.percentage}%)</span>
                  </span>
                  <span className="text-xs text-muted">
                    {new Date(attempt.submittedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Submit this quiz?"
        message={`You've answered all ${quiz.questions.length} questions. Your score is calculated as soon as you submit, and the attempt is added to your record.`}
        confirmLabel="Submit quiz"
        isLoading={isSubmitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
