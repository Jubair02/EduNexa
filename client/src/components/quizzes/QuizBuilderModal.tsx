import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import {
  emptyQuestion,
  QuizQuestionEditor,
  type DraftQuestion,
} from "@/components/quizzes/QuizQuestionEditor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { modulesService } from "@/services/modules.service";
import { quizzesService } from "@/services/quizzes.service";
import type { CourseModule, Quiz, QuizQuestionInput } from "@/types";

interface QuizBuilderModalProps {
  courseId: string;
  /** When set the builder edits this quiz; otherwise it creates a new one. */
  quiz?: Quiz | null;
  onClose: () => void;
  onSaved: (quiz: Quiz, mode: "created" | "updated") => void;
}

const toDrafts = (quiz?: Quiz | null): DraftQuestion[] => {
  if (!quiz || quiz.questions.length === 0) return [emptyQuestion("q-0")];
  return quiz.questions.map((question) => ({
    key: `saved-${question.id}`,
    questionText: question.questionText,
    type: question.type,
    options:
      question.type === "true-false" ? ["true", "false"] : [...question.options],
    correctAnswer: question.correctAnswer ?? "",
    points: String(question.points),
  }));
};

export const QuizBuilderModal = ({
  courseId,
  quiz,
  onClose,
  onSaved,
}: QuizBuilderModalProps) => {
  const isEdit = Boolean(quiz);
  const nextKey = useRef(1);

  const [title, setTitle] = useState(quiz?.title ?? "");
  const [description, setDescription] = useState(quiz?.description ?? "");
  const [moduleId, setModuleId] = useState(quiz?.module ?? "");
  const [passingScore, setPassingScore] = useState(String(quiz?.passingScore ?? 70));
  const [isRequired, setIsRequired] = useState(quiz?.isRequired ?? true);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => toDrafts(quiz));

  const [modules, setModules] = useState<CourseModule[]>([]);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [scoreError, setScoreError] = useState<string | undefined>();
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    modulesService
      .listByCourse(courseId)
      .then((result) => {
        if (!cancelled) setModules(result);
      })
      .catch(() => {
        // The module link is optional — the builder still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const patchQuestion = (key: string, patch: Partial<DraftQuestion>) => {
    setQuestions((current) =>
      current.map((question) =>
        question.key === key ? { ...question, ...patch } : question
      )
    );
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addQuestion = () => {
    const key = `new-${nextKey.current}`;
    nextKey.current += 1;
    setQuestions((current) => [...current, emptyQuestion(key)]);
  };

  const validate = (): boolean => {
    let valid = true;

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3) {
      setTitleError("The title needs at least 3 characters.");
      valid = false;
    } else {
      setTitleError(undefined);
    }

    const score = Number(passingScore);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      setScoreError("Enter a whole number between 0 and 100.");
      valid = false;
    } else {
      setScoreError(undefined);
    }

    const errors: Record<string, string> = {};
    for (const question of questions) {
      if (question.questionText.trim().length < 3) {
        errors[question.key] = "Write the question text (at least 3 characters).";
        continue;
      }
      const points = Number(question.points);
      if (!Number.isInteger(points) || points <= 0) {
        errors[question.key] = "Points must be a whole number above zero.";
        continue;
      }
      if (question.type === "true-false") {
        if (!["true", "false"].includes(question.correctAnswer)) {
          errors[question.key] = "Choose whether the answer is true or false.";
        }
        continue;
      }
      const options = question.options.map((option) => option.trim()).filter(Boolean);
      if (options.length < 2) {
        errors[question.key] = "Multiple-choice questions need at least two options.";
        continue;
      }
      if (new Set(options).size !== options.length) {
        errors[question.key] = "Options must be unique.";
        continue;
      }
      if (!options.includes(question.correctAnswer.trim())) {
        errors[question.key] = "Mark one option as the correct answer.";
      }
    }

    setQuestionErrors(errors);
    return valid && Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const payloadQuestions: QuizQuestionInput[] = questions.map((question) => ({
      questionText: question.questionText.trim(),
      type: question.type,
      options:
        question.type === "true-false"
          ? undefined
          : question.options.map((option) => option.trim()).filter(Boolean),
      correctAnswer: question.correctAnswer.trim(),
      points: Number(question.points),
    }));

    const payload = {
      title: title.trim(),
      description: description.trim(),
      module: moduleId,
      passingScore: Number(passingScore),
      isRequired,
      questions: payloadQuestions,
    };

    setIsSubmitting(true);
    try {
      if (isEdit && quiz) {
        onSaved(await quizzesService.update(quiz.id, payload), "updated");
      } else {
        onSaved(await quizzesService.create(courseId, payload), "created");
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Saving failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const totalPoints = questions.reduce(
    (sum, question) => sum + (Number(question.points) || 0),
    0
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? "Edit quiz" : "Create quiz"}
      description={
        isEdit
          ? "Changes apply to future attempts; past results keep their recorded score."
          : "New quizzes start unpublished so you can build them in peace."
      }
      className="max-w-3xl"
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <FormField
          label="Title"
          name="title"
          placeholder="e.g. Module 1 knowledge check"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={titleError}
        />

        <div>
          <Label htmlFor="quiz-description">Description (optional)</Label>
          <textarea
            id="quiz-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="quiz-module">Module (optional)</Label>
            <Select
              id="quiz-module"
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
            >
              <option value="">Course level — not tied to a module</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.order}. {module.title}
                </option>
              ))}
            </Select>
          </div>
          <FormField
            label="Passing score (%)"
            name="passingScore"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(event) => setPassingScore(event.target.value)}
            error={scoreError}
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Required for course completion
            <span className="block text-xs text-muted">
              Required quizzes count toward a student's progress alongside lessons.
            </span>
          </span>
        </label>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold">Questions</h3>
            <p className="text-xs text-muted">
              {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
              {totalPoints} point{totalPoints === 1 ? "" : "s"}
            </p>
          </div>

          <ul className="space-y-3">
            {questions.map((question, index) => (
              <QuizQuestionEditor
                key={question.key}
                index={index}
                total={questions.length}
                question={question}
                error={questionErrors[question.key]}
                onChange={(patch) => patchQuestion(question.key, patch)}
                onMove={(direction) => moveQuestion(index, direction)}
                onRemove={() =>
                  setQuestions((current) =>
                    current.filter((entry) => entry.key !== question.key)
                  )
                }
              />
            ))}
          </ul>

          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addQuestion}>
            <Plus className="size-4" aria-hidden="true" />
            Add question
          </Button>
        </div>

        <div className="flex justify-end gap-3 border-t border-soft pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Save changes" : "Create quiz"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
