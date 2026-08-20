/**
 * Content-based file type detection.
 *
 * A multipart upload's `Content-Type` and filename are both written by the
 * client, so neither proves anything about the bytes. These signature checks
 * read the actual file header, which is what stops an executable or an HTML
 * page arriving labelled "image/png" and later being served back to a browser
 * from the storage domain.
 */

/** Byte signature at a known offset. */
interface Signature {
  offset: number;
  bytes: number[];
}

const startsWith = (buffer: Buffer, { offset, bytes }: Signature): boolean => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
};

const JPEG: Signature = { offset: 0, bytes: [0xff, 0xd8, 0xff] };
const PNG: Signature = { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] };
const RIFF: Signature = { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }; // "RIFF"
const WEBP: Signature = { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }; // "WEBP"
const PDF: Signature = { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }; // "%PDF-"
const ZIP: Signature = { offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }; // DOCX is a zip
const ZIP_EMPTY: Signature = { offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] };
const ZIP_SPANNED: Signature = { offset: 0, bytes: [0x50, 0x4b, 0x07, 0x08] };
const OLE2: Signature = {
  offset: 0,
  bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // legacy .doc
};

/** The file types the LMS accepts, as detected from content. */
export type DetectedType = "jpeg" | "png" | "webp" | "pdf" | "docx" | "doc";

export const detectFileType = (buffer: Buffer): DetectedType | null => {
  if (startsWith(buffer, JPEG)) return "jpeg";
  if (startsWith(buffer, PNG)) return "png";
  if (startsWith(buffer, RIFF) && startsWith(buffer, WEBP)) return "webp";
  if (startsWith(buffer, PDF)) return "pdf";
  if (
    startsWith(buffer, ZIP) ||
    startsWith(buffer, ZIP_EMPTY) ||
    startsWith(buffer, ZIP_SPANNED)
  ) {
    return "docx";
  }
  if (startsWith(buffer, OLE2)) return "doc";
  return null;
};

/** Control characters and the Windows-reserved set, written as escapes. */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");
const RESERVED_CHARS = /[<>:"|?*]/g;

/**
 * Strips a client-supplied filename down to something safe to hand to storage:
 * no directory separators, no traversal, no control characters, length capped.
 * Returns undefined when nothing usable is left.
 */
export const sanitizeFileName = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;

  // Keep only the final path segment, however the client spelled the separator.
  const base = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(CONTROL_CHARS, "")
    .replace(RESERVED_CHARS, "")
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned) return undefined;
  return cleaned.length > 200 ? cleaned.slice(-200) : cleaned;
};
