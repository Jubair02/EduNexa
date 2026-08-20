import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lesson } from "@/types";
import { safeUrl } from "@/utils/safeUrl";
import { toEmbedUrl } from "@/utils/videoEmbed";

/** Shown instead of a link when a stored URL isn't a safe http(s) address. */
const UnavailableMedia = ({ kind }: { kind: string }) => (
  <div className="rounded-xl border border-soft p-6 text-center">
    <p className="text-sm text-muted">
      This {kind} can&apos;t be displayed — its address is invalid. Please ask your
      instructor to update the lesson.
    </p>
  </div>
);

/** Renders a lesson body according to its type: video, text, pdf, or document. */
export const LessonContent = ({ lesson }: { lesson: Lesson }) => {
  switch (lesson.type) {
    case "video": {
      if (!lesson.videoUrl) return null;
      const embedUrl = toEmbedUrl(lesson.videoUrl);
      if (embedUrl) {
        return (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-aubergine">
            <iframe
              src={embedUrl}
              title={lesson.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      // Not a recognised provider — fall back to a direct player, but only for
      // a vetted http(s) URL.
      const directUrl = safeUrl(lesson.videoUrl);
      if (!directUrl) return <UnavailableMedia kind="video" />;
      return (
        <video controls className="aspect-video w-full rounded-xl bg-aubergine">
          <source src={directUrl} />
          Your browser can&apos;t play this video.{" "}
          <a href={directUrl} target="_blank" rel="noopener noreferrer">
            Open it directly instead.
          </a>
        </video>
      );
    }
    case "text":
      return (
        <div className="text-sm leading-relaxed whitespace-pre-line">{lesson.content}</div>
      );
    case "pdf": {
      if (!lesson.fileUrl) return null;
      const fileUrl = safeUrl(lesson.fileUrl);
      if (!fileUrl) return <UnavailableMedia kind="PDF" />;
      return (
        <div className="space-y-3">
          <iframe
            src={fileUrl}
            title={lesson.fileName ?? `${lesson.title} (PDF)`}
            className="h-[70vh] w-full rounded-xl border border-soft"
          />
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="size-4" aria-hidden="true" />
              Open {lesson.fileName ?? "PDF"} in a new tab
            </Button>
          </a>
        </div>
      );
    }
    case "document": {
      if (!lesson.fileUrl) return null;
      const fileUrl = safeUrl(lesson.fileUrl);
      if (!fileUrl) return <UnavailableMedia kind="document" />;
      return (
        <div className="rounded-xl border border-soft p-6 text-center">
          <p className="text-sm text-muted">
            This lesson is a document{lesson.fileName ? `: ${lesson.fileName}` : ""}.
          </p>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="mt-3">
              <Download className="size-4" aria-hidden="true" />
              Open document
            </Button>
          </a>
        </div>
      );
    }
  }
};
