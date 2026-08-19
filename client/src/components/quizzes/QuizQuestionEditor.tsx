import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { QuestionType } from "@/types";
import { cn } from "@/utils/cn";

export interface DraftQuestion {
  /** Stable local key — question ids only exist after saving. */
  key: string;
  questionText: string;
  type: QuestionType;
  options: string[];
  correctAnswer: string;
  /** Kept as text while editing so the field can be cleared. */
  points: string;
}

export const MAX_OPTIONS = 6;

export const emptyQuestion = (key: string): DraftQuestion => ({
  key,
  questionText: "",
  type: "multiple-choice",
  options: ["", ""],
  correctAnswer: "",
  points: "10",
});

interface QuizQuestionEditorProps {
  index: number;
  total: number;
  question: DraftQuestion;
  error?: string;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export const QuizQuestionEditor = ({
  index,
  total,
  question,
  error,
  onChange,
  onMove,
  onRemove,
}: QuizQuestionEditorProps) => {
  const isTrueFalse = question.type === "true-false";
  const fieldId = `question-${question.key}`;

  const changeType = (type: QuestionType) => {
    // Switching type resets the answer shape rather than leaving a stale key.
    onChange(
      type === "true-false"
        ? { type, options: ["true", "false"], correctAnswer: "true" }
        : { type, options: ["", ""], correctAnswer: "" }
    );
  };

  const changeOption = (optionIndex: number, value: string) => {
    const options = question.options.map((option, i) => (i === optionIndex ? value : option));
    // Keep the selected answer pointing at the option being renamed.
    const correctAnswer =
      question.correctAnswer === question.options[optionIndex]
        ? value
        : question.correctAnswer;
    onChange({ options, correctAnswer });
  };

  return (
    <li className="rounded-xl border border-soft p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Question {index + 1}
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move question ${index + 1} up`}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-primary-soft hover:text-ink disabled:opacity-30"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move question ${index + 1} down`}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-primary-soft hover:text-ink disabled:opacity-30"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={total === 1}
            aria-label={`Remove question ${index + 1}`}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor={`${fieldId}-text`}>Question</Label>
          <textarea
            id={`${fieldId}-text`}
            rows={2}
            value={question.questionText}
            onChange={(event) => onChange({ questionText: event.target.value })}
            placeholder="What do you want to ask?"
            className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${fieldId}-type`}>Type</Label>
            <Select
              id={`${fieldId}-type`}
              value={question.type}
              onChange={(event) => changeType(event.target.value as QuestionType)}
            >
              <option value="multiple-choice">Multiple choice</option>
              <option value="true-false">True / False</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${fieldId}-points`}>Points</Label>
            <Input
              id={`${fieldId}-points`}
              type="number"
              min={1}
              value={question.points}
              onChange={(event) => onChange({ points: event.target.value })}
            />
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">
            {isTrueFalse ? "Correct answer" : "Options — select the correct one"}
          </legend>

          {isTrueFalse ? (
            <div className="flex gap-4">
              {["true", "false"].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="radio"
                    name={`${fieldId}-answer`}
                    value={value}
                    checked={question.correctAnswer === value}
                    onChange={() => onChange({ correctAnswer: value })}
                    className="size-4 accent-primary"
                  />
                  {value}
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${fieldId}-answer`}
                    checked={option.length > 0 && question.correctAnswer === option}
                    disabled={option.trim().length === 0}
                    onChange={() => onChange({ correctAnswer: option })}
                    aria-label={`Mark option ${optionIndex + 1} as correct`}
                    className="size-4 shrink-0 accent-primary disabled:opacity-40"
                  />
                  <Input
                    value={option}
                    onChange={(event) => changeOption(optionIndex, event.target.value)}
                    placeholder={`Option ${optionIndex + 1}`}
                    aria-label={`Option ${optionIndex + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        options: question.options.filter((_, i) => i !== optionIndex),
                        correctAnswer:
                          question.correctAnswer === option ? "" : question.correctAnswer,
                      })
                    }
                    disabled={question.options.length <= 2}
                    aria-label={`Remove option ${optionIndex + 1}`}
                    className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}

              {question.options.length < MAX_OPTIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ options: [...question.options, ""] })}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add option
                </Button>
              )}
            </div>
          )}
        </fieldset>

        {error && (
          <p className={cn("text-sm text-danger")} role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
};
