import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { modulesService } from "@/services/modules.service";
import type { CourseModule } from "@/types";

interface ModuleFormModalProps {
  courseId: string;
  /** When set, the form edits this module; otherwise it creates a new one. */
  module?: CourseModule | null;
  onClose: () => void;
  onSaved: (module: CourseModule, mode: "created" | "updated") => void;
}

export const ModuleFormModal = ({
  courseId,
  module,
  onClose,
  onSaved,
}: ModuleFormModalProps) => {
  const isEdit = Boolean(module);
  const [title, setTitle] = useState(module?.title ?? "");
  const [description, setDescription] = useState(module?.description ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Enter a module title.");
      return;
    }
    if (trimmed.length < 3) {
      setTitleError("The title needs at least 3 characters.");
      return;
    }
    setTitleError(null);

    setIsSubmitting(true);
    try {
      const payload = { title: trimmed, description: description.trim() };
      if (isEdit && module) {
        onSaved(await modulesService.update(module.id, payload), "updated");
      } else {
        onSaved(await modulesService.create(courseId, payload), "created");
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Saving failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? "Edit module" : "Add module"}
      description={
        isEdit
          ? "Update this module's title or description."
          : "New modules start unpublished, at the end of the course."
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <FormField
          label="Title"
          name="title"
          placeholder="e.g. Introduction"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={titleError ?? undefined}
        />

        <div>
          <Label htmlFor="module-description">Description (optional)</Label>
          <textarea
            id="module-description"
            name="description"
            rows={3}
            placeholder="What does this module cover?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Save changes" : "Add module"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
