import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ApiRequestError } from "@/services/api";
import { lessonsService } from "@/services/lessons.service";
import {
  DOCUMENT_ACCEPT,
  MAX_FILE_BYTES,
  PDF_ACCEPT,
  uploadsService,
} from "@/services/uploads.service";
import type { Lesson, LessonSummary, LessonType } from "@/types";

interface LessonFormModalProps {
  moduleId: string;
  /** When set, the form edits this lesson; otherwise it creates a new one. */
  lesson?: LessonSummary | null;
  onClose: () => void;
  onSaved: (lesson: Lesson, mode: "created" | "updated") => void;
}

interface FieldErrors {
  title?: string;
  content?: string;
  videoUrl?: string;
  fileUrl?: string;
  duration?: string;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

const typeLabels: Record<LessonType, string> = {
  video: "Video",
  text: "Text",
  pdf: "PDF",
  document: "Document",
};

/**
 * Create/edit lesson form. The content fields adapt to the selected type:
 * video → URL + duration, text → body, pdf/document → file URL + name.
 */
export const LessonFormModal = ({
  moduleId,
  lesson,
  onClose,
  onSaved,
}: LessonFormModalProps) => {
  const isEdit = Boolean(lesson);
  const initialFull = lesson as Lesson | null | undefined;

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [type, setType] = useState<LessonType>(lesson?.type ?? "video");
  const [content, setContent] = useState(initialFull?.content ?? "");
  const [videoUrl, setVideoUrl] = useState(initialFull?.videoUrl ?? "");
  const [fileUrl, setFileUrl] = useState(initialFull?.fileUrl ?? "");
  const [fileName, setFileName] = useState(initialFull?.fileName ?? "");
  const [filePublicId, setFilePublicId] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [duration, setDuration] = useState(lesson?.duration ? String(lesson.duration) : "");
  const [isPreview, setIsPreview] = useState(lesson?.isPreview ?? false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = "Enter a lesson title.";
    } else if (trimmedTitle.length < 3) {
      errors.title = "The title needs at least 3 characters.";
    }

    if (type === "video") {
      if (!videoUrl.trim()) {
        errors.videoUrl = "Enter the video URL.";
      } else if (!URL_PATTERN.test(videoUrl.trim())) {
        errors.videoUrl = "Enter a full URL (https://…).";
      }
    }
    if (type === "text" && !content.trim()) {
      errors.content = "Write the lesson content.";
    }
    if (type === "pdf" || type === "document") {
      if (!fileUrl.trim()) {
        errors.fileUrl =
          type === "pdf" ? "Enter the PDF file URL." : "Enter the document file URL.";
      } else if (!URL_PATTERN.test(fileUrl.trim())) {
        errors.fileUrl = "Enter a full URL (https://…).";
      }
    }

    if (duration.trim()) {
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        errors.duration = "Duration must be a positive number of minutes.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLessonFile = async (file: File | undefined) => {
    if (!file || (type !== "pdf" && type !== "document")) return;
    setUploadError(null);

    const isPdf = type === "pdf";
    const validType = isPdf
      ? file.type === "application/pdf"
      : DOCUMENT_ACCEPT.includes(file.type) || /\.(doc|docx)$/i.test(file.name);
    if (!validType) {
      setUploadError(isPdf ? "Choose a PDF file." : "Choose a DOC or DOCX file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("The file must be 20 MB or smaller.");
      return;
    }

    setUploadProgress(0);
    try {
      const stored = await uploadsService.upload(
        file,
        isPdf ? "pdf" : "document",
        setUploadProgress
      );
      setFileUrl(stored.url);
      setFileName(stored.fileName ?? file.name);
      setFilePublicId(stored.publicId ?? "");
      setFieldErrors((prev) => ({ ...prev, fileUrl: undefined }));
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "The upload failed. Please try again."
      );
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const payload = {
      title: title.trim(),
      description: description.trim(),
      type,
      content: type === "text" ? content : "",
      videoUrl: type === "video" ? videoUrl.trim() : "",
      fileUrl: type === "pdf" || type === "document" ? fileUrl.trim() : "",
      fileName: type === "pdf" || type === "document" ? fileName.trim() : "",
      filePublicId: type === "pdf" || type === "document" ? filePublicId : "",
      duration: duration.trim() ? Number(duration) : null,
      isPreview,
    };

    setIsSubmitting(true);
    try {
      if (isEdit && lesson) {
        onSaved(await lessonsService.update(lesson.id, payload), "updated");
      } else {
        onSaved(await lessonsService.create(moduleId, payload), "created");
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.fieldErrors?.length) {
        const serverErrors: FieldErrors = {};
        for (const fieldError of error.fieldErrors) {
          serverErrors[fieldError.field as keyof FieldErrors] = fieldError.message;
        }
        setFieldErrors(serverErrors);
      }
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
      title={isEdit ? "Edit lesson" : "Add lesson"}
      description={
        isEdit
          ? "Update this lesson. Its fields follow the selected type."
          : "New lessons start unpublished, at the end of the module."
      }
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        {formError && <Alert variant="error">{formError}</Alert>}

        <FormField
          label="Title"
          name="title"
          placeholder="e.g. Welcome"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={fieldErrors.title}
        />

        <div>
          <Label htmlFor="lesson-description">Description (optional)</Label>
          <textarea
            id="lesson-description"
            name="description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25"
          />
        </div>

        <div>
          <Label htmlFor="lesson-type">Lesson type</Label>
          <Select
            id="lesson-type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as LessonType)}
          >
            {(Object.keys(typeLabels) as LessonType[]).map((value) => (
              <option key={value} value={value}>
                {typeLabels[value]}
              </option>
            ))}
          </Select>
        </div>

        {type === "video" && (
          <FormField
            label="Video URL"
            name="videoUrl"
            type="url"
            placeholder="https://youtube.com/watch?v=… or Vimeo/Cloudinary URL"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            error={fieldErrors.videoUrl}
          />
        )}

        {type === "text" && (
          <div>
            <Label htmlFor="lesson-content">Text content</Label>
            <textarea
              id="lesson-content"
              name="content"
              rows={8}
              placeholder="Write the lesson here…"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              aria-invalid={fieldErrors.content ? true : undefined}
              aria-describedby={fieldErrors.content ? "lesson-content-error" : undefined}
              className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25 aria-invalid:border-danger"
            />
            {fieldErrors.content && (
              <p id="lesson-content-error" className="mt-1.5 text-sm text-danger">
                {fieldErrors.content}
              </p>
            )}
          </div>
        )}

        {(type === "pdf" || type === "document") && (
          <>
            <div>
              <Label htmlFor="lesson-file">
                {type === "pdf" ? "Upload PDF" : "Upload DOC/DOCX"}
              </Label>
              <input
                id="lesson-file"
                type="file"
                accept={type === "pdf" ? PDF_ACCEPT : DOCUMENT_ACCEPT}
                onChange={(event) => void handleLessonFile(event.target.files?.[0])}
                disabled={uploadProgress !== null}
                className="block w-full cursor-pointer rounded-lg border border-soft bg-surface text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-primary-soft file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-primary-strong"
              />
              <p className="mt-1 text-xs text-muted">
                {type === "pdf" ? "PDF up to 20 MB." : "DOC or DOCX up to 20 MB."}
              </p>
              {uploadProgress !== null && (
                <p className="mt-1 text-sm text-muted" role="status">
                  Uploading… {uploadProgress}%
                </p>
              )}
              {uploadError && <p className="mt-1 text-sm text-danger">{uploadError}</p>}
              {fileUrl && !uploadError && uploadProgress === null && (
                <p className="mt-1 text-sm text-success">
                  Attached: {fileName || fileUrl}
                </p>
              )}
            </div>

            <FormField
              label={type === "pdf" ? "Or PDF file URL" : "Or document file URL"}
              name="fileUrl"
              type="url"
              placeholder="https://… (used as-is if no file is uploaded)"
              value={fileUrl}
              onChange={(event) => {
                setFileUrl(event.target.value);
                setFilePublicId("");
              }}
              error={fieldErrors.fileUrl}
            />
            <FormField
              label="File name (optional)"
              name="fileName"
              placeholder={type === "pdf" ? "lesson.pdf" : "notes.docx"}
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
          </>
        )}

        {type === "video" && (
          <FormField
            label="Duration (minutes)"
            name="duration"
            type="number"
            min={1}
            placeholder="e.g. 12"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            error={fieldErrors.duration}
          />
        )}

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isPreview"
            checked={isPreview}
            onChange={(event) => setIsPreview(event.target.checked)}
            className="size-4 accent-primary"
          />
          Preview lesson — viewable without enrollment once published
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Save changes" : "Add lesson"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
