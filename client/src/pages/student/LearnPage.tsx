import {
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Download,
  File,
  FileText,
  PartyPopper,
  ScrollText,
  Undo2,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link, useParams } from "react-router-dom";
import { LessonContent } from "@/components/courses/LessonContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/useToast";
import { certificatesService } from "@/services/certificates.service";
import { coursesService } from "@/services/courses.service";
import { enrollmentsService } from "@/services/enrollments.service";
import { lessonsService } from "@/services/lessons.service";
import { modulesService } from "@/services/modules.service";
import { progressService } from "@/services/progress.service";
import { quizzesService } from "@/services/quizzes.service";
import type {
  Course,
  CourseModule,
  CourseProgress,
  Lesson,
  LessonContext,
  LessonSummary,
  LessonType,
  Quiz,
} from "@/types";
import { cn } from "@/utils/cn";
import { formatDuration } from "@/utils/courseMeta";

const lessonTypeIcons: Record<LessonType, ComponentType<{ className?: string }>> = {
  video: Video,
  text: ScrollText,
  pdf: FileText,
  document: File,
};

type LoadStatus = "loading" | "error" | "not-enrolled" | "ready";

/** The enrolled-student learning experience: content sidebar + lesson viewer. */
export const LearnPage = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { showToast } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [lessonsByModule, setLessonsByModule] = useState<Record<string, LessonSummary[]>>({});
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const [current, setCurrent] = useState<{ lesson: Lesson; context: LessonContext } | null>(
    null
  );
  const [lessonStatus, setLessonStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const openLesson = useCallback(async (lessonId: string) => {
    setLessonStatus("loading");
    try {
      setCurrent(await lessonsService.get(lessonId));
      setLessonStatus("idle");
      window.scrollTo({ top: 0 });
    } catch {
      setLessonStatus("error");
    }
  }, []);

  const load = useCallback(async () => {
    if (!courseId) return;
    setStatus("loading");
    try {
      const [loadedCourse, check] = await Promise.all([
        coursesService.get(courseId),
        enrollmentsService.check(courseId),
      ]);
      if (!check.isEnrolled) {
        setCourse(loadedCourse);
        setStatus("not-enrolled");
        return;
      }

      const [moduleList, loadedQuizzes, loadedProgress] = await Promise.all([
        modulesService.listByCourse(courseId),
        quizzesService.listByCourse(courseId),
        progressService.getCourseProgress(courseId),
      ]);
      const lessonLists = await Promise.all(
        moduleList.map((module) => lessonsService.listByModule(module.id))
      );
      const byModule = Object.fromEntries(
        moduleList.map((module, index) => [module.id, lessonLists[index]])
      );

      setCourse(loadedCourse);
      setModules(moduleList);
      setLessonsByModule(byModule);
      setQuizzes(loadedQuizzes);
      setProgress(loadedProgress);
      setStatus("ready");

      const firstLesson = moduleList.map((module) => byModule[module.id] ?? []).flat()[0];
      if (firstLesson) {
        void openLesson(firstLesson.id);
      }
    } catch {
      setStatus("error");
    }
  }, [courseId, openLesson]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCertificate = async (certificateId: string) => {
    setIsDownloading(true);
    try {
      const certificate = await certificatesService.get(certificateId);
      await certificatesService.download(
        certificateId,
        `${certificate.certificateNumber}.pdf`
      );
      showToast("Certificate downloaded");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "The download failed. Please try again.",
        "error"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  /** Completion updates the course totals in place — no reload. */
  const toggleLessonComplete = async (isCompleted: boolean) => {
    if (!current) return;
    setIsSavingProgress(true);
    try {
      const response = await progressService.setLessonProgress(
        current.lesson.id,
        isCompleted
      );
      setProgress(response.courseProgress);
      showToast(isCompleted ? "Lesson marked complete" : "Lesson marked incomplete");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Couldn't save your progress.",
        "error"
      );
    } finally {
      setIsSavingProgress(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="space-y-4" aria-label="Loading course">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="font-medium">Unable to load course content.</p>
          <p className="mt-1 text-sm text-muted">Please try again.</p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "not-enrolled") {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="font-medium">You need an active enrollment to open this course.</p>
          <p className="mt-1 text-sm text-muted">
            Enroll (or re-enroll) from the course page to continue learning.
          </p>
          {course && (
            <Link to={`/courses/${course.slug}`}>
              <Button className="mt-4">Go to course page</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const completedLessons = new Set(progress?.completedLessonIds ?? []);
  const passedQuizzes = new Set(progress?.passedQuizIds ?? []);
  const isCurrentComplete = current ? completedLessons.has(current.lesson.id) : false;
  const courseQuizzes = quizzes.filter((quiz) => quiz.module === null);
  const totalLessons = Object.values(lessonsByModule).reduce(
    (sum, lessons) => sum + lessons.length,
    0
  );

  const quizRow = (quiz: Quiz) => {
    const passed = passedQuizzes.has(quiz.id);
    return (
      <li key={quiz.id}>
        <Link
          to={`/student/courses/${courseId}/quizzes/${quiz.id}`}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-paper hover:text-ink"
        >
          {passed ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">{quiz.title}</span>
          {passed && <span className="sr-only">Passed</span>}
          {quiz.isRequired && !passed && (
            <span className="text-[10px] font-medium tracking-wide uppercase">Required</span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={course ? `/courses/${course.slug}` : "/student/courses"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Course
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
          {course?.title}
        </h1>
      </div>

      {/* Course progress */}
      {progress && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-4">
            <div className="min-w-[12rem] flex-1">
              <Progress
                value={progress.progressPercentage}
                label={`${progress.completedRequiredItems} of ${progress.totalRequiredItems} required items complete`}
              />
            </div>
            <p className="font-display text-2xl font-semibold tabular-nums">
              {progress.progressPercentage}%
            </p>
            {progress.isCompleted && <Badge variant="success">Course complete</Badge>}
          </CardContent>
        </Card>
      )}

      {/* Completion celebration — only once the backend confirms completion. */}
      {progress?.isCompleted && (
        <Card className="border-success/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-success-soft p-2.5" aria-hidden="true">
                <PartyPopper className="size-6 text-success" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold">Course Completed!</h2>
                <p className="mt-1 text-sm text-muted">
                  Congratulations! You have successfully completed this course.
                </p>
              </div>
            </div>

            {progress.certificateAvailable && progress.certificateId && (
              <div className="flex flex-wrap gap-2">
                <Link to={`/student/certificates`}>
                  <Button variant="outline">
                    <Award className="size-4" aria-hidden="true" />
                    View Certificate
                  </Button>
                </Link>
                <Button
                  onClick={() => void downloadCertificate(progress.certificateId!)}
                  isLoading={isDownloading}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download Certificate
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
        {/* Course content sidebar */}
        <nav
          aria-label="Course content"
          className="rounded-2xl border border-soft bg-surface p-3 lg:sticky lg:top-20"
        >
          <p className="px-2 pb-2 text-xs font-medium tracking-wide text-muted uppercase">
            Course Content
          </p>

          {totalLessons === 0 && courseQuizzes.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted">No lessons published yet.</p>
          )}

          <div className="space-y-3">
            {modules.map((module) => {
              const lessons = lessonsByModule[module.id] ?? [];
              const moduleQuizzes = quizzes.filter((quiz) => quiz.module === module.id);
              return (
                <div key={module.id}>
                  <p className="px-2 py-1 text-sm font-semibold">{module.title}</p>
                  <ul>
                    {lessons.map((lesson) => {
                      const TypeIcon = lessonTypeIcons[lesson.type];
                      const isActive = current?.lesson.id === lesson.id;
                      const done = completedLessons.has(lesson.id);
                      return (
                        <li key={lesson.id}>
                          <button
                            type="button"
                            onClick={() => void openLesson(lesson.id)}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                              isActive
                                ? "bg-primary-soft font-medium text-primary-strong"
                                : "text-muted hover:bg-paper hover:text-ink"
                            )}
                          >
                            {done ? (
                              <CheckCircle2
                                className="size-4 shrink-0 text-success"
                                aria-hidden="true"
                              />
                            ) : (
                              <Circle className="size-4 shrink-0" aria-hidden="true" />
                            )}
                            <TypeIcon className="size-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                            {done && <span className="sr-only">Completed</span>}
                            {lesson.duration ? (
                              <span className="text-xs whitespace-nowrap">
                                {formatDuration(lesson.duration)}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                    {moduleQuizzes.map(quizRow)}
                  </ul>
                </div>
              );
            })}

            {courseQuizzes.length > 0 && (
              <div>
                <p className="px-2 py-1 text-sm font-semibold">Course quizzes</p>
                <ul>{courseQuizzes.map(quizRow)}</ul>
              </div>
            )}
          </div>
        </nav>

        {/* Lesson viewer */}
        <Card>
          <CardContent className="space-y-5 py-6">
            {lessonStatus === "loading" && (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}

            {lessonStatus === "error" && (
              <div className="py-12 text-center">
                <p className="font-medium">Unable to load this lesson.</p>
                <p className="mt-1 text-sm text-muted">
                  Please pick another lesson or retry.
                </p>
              </div>
            )}

            {lessonStatus === "idle" && !current && (
              <p className="py-12 text-center text-sm text-muted">
                Choose a lesson from the course content to start learning.
              </p>
            )}

            {lessonStatus === "idle" && current && (
              <>
                <div>
                  <p className="text-xs tracking-wide text-muted uppercase">
                    {current.context.moduleTitle}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-semibold">
                      {current.lesson.title}
                    </h2>
                    {isCurrentComplete && (
                      <Badge variant="success">
                        <Check className="mr-1 inline size-3" aria-hidden="true" />
                        Completed
                      </Badge>
                    )}
                    {current.lesson.isPreview && <Badge variant="amber">Preview</Badge>}
                    {current.lesson.duration ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted">
                        <Clock className="size-4" aria-hidden="true" />
                        {formatDuration(current.lesson.duration)}
                      </span>
                    ) : null}
                  </div>
                  {current.lesson.description && (
                    <p className="mt-2 text-sm text-muted">{current.lesson.description}</p>
                  )}
                </div>

                <LessonContent lesson={current.lesson} />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-soft pt-5">
                  {current.context.previousLessonId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openLesson(current.context.previousLessonId!)}
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                      Previous Lesson
                    </Button>
                  ) : (
                    <span />
                  )}

                  {isCurrentComplete ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleLessonComplete(false)}
                      isLoading={isSavingProgress}
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                      Mark as Incomplete
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void toggleLessonComplete(true)}
                      isLoading={isSavingProgress}
                    >
                      <Check className="size-4" aria-hidden="true" />
                      Mark as Complete
                    </Button>
                  )}

                  {current.context.nextLessonId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void openLesson(current.context.nextLessonId!)}
                    >
                      Next Lesson
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
