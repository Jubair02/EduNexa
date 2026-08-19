import { useEffect, useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CourseThumbnail } from "@/components/CourseThumbnail";
import { useAuth } from "@/hooks/useAuth";
import { ApiRequestError } from "@/services/api";
import { coursesService } from "@/services/courses.service";
import {
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  uploadsService,
} from "@/services/uploads.service";
import { usersService } from "@/services/users.service";
import {
  COURSE_CATEGORIES,
  type Course,
  type CourseCategory,
  type CourseLevel,
  type User,
} from "@/types";
import { categoryLabels, levelLabels } from "@/utils/courseMeta";

interface CourseFormProps {
  /** When set, the form edits this course; otherwise it creates a new one. */
  course?: Course | null;
  /** Admins pick an instructor; instructors are always assigned themselves. */
  variant: "admin" | "instructor";
  onSaved: (course: Course, mode: "created" | "updated") => void;
  onCancel: () => void;
}

interface FieldErrors {
  title?: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  level?: string;
  duration?: string;
  instructor?: string;
  thumbnail?: string;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

export const CourseForm = ({ course, variant, onSaved, onCancel }: CourseFormProps) => {
  const isEdit = Boolean(course);
  const { user } = useAuth();

  const [title, setTitle] = useState(course?.title ?? "");
  const [shortDescription, setShortDescription] = useState(course?.shortDescription ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [category, setCategory] = useState<CourseCategory>(course?.category ?? "programming");
  const [level, setLevel] = useState<CourseLevel>(course?.level ?? "beginner");
  const [duration, setDuration] = useState(course?.duration ? String(course.duration) : "");
  const [thumbnail, setThumbnail] = useState(course?.thumbnail?.url ?? "");
  const [thumbnailPublicId, setThumbnailPublicId] = useState(
    course?.thumbnail?.publicId ?? ""
  );
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState(course?.instructor?.id ?? "");

  const [instructors, setInstructors] = useState<User[]>([]);
  const [instructorsError, setInstructorsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admins pick from the platform's instructors.
  useEffect(() => {
    if (variant !== "admin") return;
    let cancelled = false;
    usersService
      .list({ page: 1, limit: 100, search: "", role: "instructor", status: "active" })
      .then((result) => {
        if (!cancelled) setInstructors(result.users);
      })
      .catch(() => {
        if (!cancelled) setInstructorsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errors.title = "Enter a course title.";
    } else if (trimmedTitle.length < 3) {
      errors.title = "The title needs at least 3 characters.";
    } else if (trimmedTitle.length > 120) {
      errors.title = "Keep the title under 120 characters.";
    }

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      errors.description = "Describe the course.";
    } else if (trimmedDescription.length < 10) {
      errors.description = "The description needs at least 10 characters.";
    } else if (trimmedDescription.length > 5000) {
      errors.description = "Keep the description under 5000 characters.";
    }

    if (shortDescription.trim().length > 300) {
      errors.shortDescription = "Keep the short description under 300 characters.";
    }

    if (duration.trim()) {
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        errors.duration = "Duration must be a positive number of minutes.";
      }
    }

    if (thumbnail.trim() && !URL_PATTERN.test(thumbnail.trim())) {
      errors.thumbnail = "Enter a full image URL (https://…).";
    }

    if (variant === "admin" && !instructorId) {
      errors.instructor = "Choose an instructor.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleThumbnailFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
      setUploadError("Choose a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("The image must be 5 MB or smaller.");
      return;
    }

    setUploadProgress(0);
    try {
      const stored = await uploadsService.upload(file, "image", setUploadProgress);
      setThumbnail(stored.url);
      setThumbnailPublicId(stored.publicId ?? "");
      setFieldErrors((prev) => ({ ...prev, thumbnail: undefined }));
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
      shortDescription: shortDescription.trim(),
      category,
      level,
      duration: duration.trim() ? Number(duration) : null,
      thumbnail: thumbnail.trim(),
      thumbnailPublicId: thumbnail.trim() ? thumbnailPublicId : "",
      // Instructors never send an instructor id — the backend assigns them.
      ...(variant === "admin" ? { instructor: instructorId } : {}),
    };

    setIsSubmitting(true);
    try {
      if (isEdit && course) {
        onSaved(await coursesService.update(course.id, payload), "updated");
      } else {
        onSaved(await coursesService.create(payload), "created");
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
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
      {formError && <Alert variant="error">{formError}</Alert>}

      <FormField
        label="Title"
        name="title"
        placeholder="e.g. React Fundamentals"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
      />

      <FormField
        label="Short description"
        name="shortDescription"
        placeholder="One or two lines shown on course cards (optional)"
        value={shortDescription}
        onChange={(event) => setShortDescription(event.target.value)}
        error={fieldErrors.shortDescription}
      />

      <div>
        <Label htmlFor="course-description">Description</Label>
        <textarea
          id="course-description"
          name="description"
          rows={6}
          placeholder="What will students learn in this course?"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? "course-description-error" : undefined}
          className="w-full rounded-lg border border-soft bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary/25 aria-invalid:border-danger"
        />
        {fieldErrors.description && (
          <p id="course-description-error" className="mt-1.5 text-sm text-danger">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="course-category">Category</Label>
          <Select
            id="course-category"
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value as CourseCategory)}
          >
            {COURSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </Select>
          {fieldErrors.category && (
            <p className="mt-1.5 text-sm text-danger">{fieldErrors.category}</p>
          )}
        </div>

        <div>
          <Label htmlFor="course-level">Level</Label>
          <Select
            id="course-level"
            name="level"
            value={level}
            onChange={(event) => setLevel(event.target.value as CourseLevel)}
          >
            {(Object.keys(levelLabels) as CourseLevel[]).map((value) => (
              <option key={value} value={value}>
                {levelLabels[value]}
              </option>
            ))}
          </Select>
          {fieldErrors.level && (
            <p className="mt-1.5 text-sm text-danger">{fieldErrors.level}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Duration (minutes)"
          name="duration"
          type="number"
          min={1}
          placeholder="e.g. 300"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          error={fieldErrors.duration}
        />

        {variant === "admin" ? (
          <div>
            <Label htmlFor="course-instructor">Instructor</Label>
            <Select
              id="course-instructor"
              name="instructor"
              value={instructorId}
              onChange={(event) => setInstructorId(event.target.value)}
            >
              <option value="">Choose an instructor…</option>
              {instructors.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.firstName} {candidate.lastName} — {candidate.email}
                </option>
              ))}
            </Select>
            {instructorsError && (
              <p className="mt-1.5 text-sm text-danger">
                Couldn't load instructors. Reload the page to try again.
              </p>
            )}
            {fieldErrors.instructor && (
              <p className="mt-1.5 text-sm text-danger">{fieldErrors.instructor}</p>
            )}
          </div>
        ) : (
          <div>
            <Label htmlFor="course-instructor-self">Instructor</Label>
            <input
              id="course-instructor-self"
              value={user ? `${user.firstName} ${user.lastName} (you)` : ""}
              disabled
              className="h-11 w-full rounded-lg border border-soft bg-paper px-3.5 text-sm text-muted"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="course-thumbnail-file">Thumbnail</Label>
          <input
            id="course-thumbnail-file"
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={(event) => void handleThumbnailFile(event.target.files?.[0])}
            disabled={uploadProgress !== null}
            className="block w-full cursor-pointer rounded-lg border border-soft bg-surface text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-primary-soft file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-primary-strong"
          />
          <p className="mt-1 text-xs text-muted">JPEG, PNG, or WEBP — up to 5 MB.</p>
          {uploadProgress !== null && (
            <p className="mt-1 text-sm text-muted" role="status">
              Uploading… {uploadProgress}%
            </p>
          )}
          {uploadError && <p className="mt-1 text-sm text-danger">{uploadError}</p>}
        </div>

        <FormField
          label="Or thumbnail URL"
          name="thumbnail"
          type="url"
          placeholder="https://… (used as-is if no file is uploaded)"
          value={thumbnail}
          onChange={(event) => {
            setThumbnail(event.target.value);
            setThumbnailPublicId("");
          }}
          error={fieldErrors.thumbnail}
        />
        {thumbnail.trim() && !fieldErrors.thumbnail && (
          <div className="mt-2 h-28 w-48 overflow-hidden rounded-lg border border-soft">
            <CourseThumbnail course={{ title: title || "Course", thumbnail: { url: thumbnail.trim() } }} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-soft pt-5">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {isEdit ? "Save changes" : "Create course"}
        </Button>
      </div>
    </form>
  );
};
