// Shared by client-side (immediate feedback) and server-side (authoritative) validation, per
// File_Uploads.md's Shared Upload Requirements — "client-side validation alone is not sufficient
// since it can be bypassed." Exact byte caps are an implementation decision, not a product
// requirement (File_Uploads.md says "e.g." for PDF/Image) — PDF 50MB and Image 20MB are the
// doc's own suggested numbers; general Files gets 25MB as a middle-ground, documented-here
// decision (the doc leaves it unspecified).

export const FILES_STORAGE_BUCKET = "files";

export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const GENERAL_FILE_MAX_BYTES = 25 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

// Explicit allow-list per File_Uploads.md's General Files section ("a defined allow-list of
// common, safe file types ... documents, spreadsheets, archives, text files") — deliberately not
// "any file type", to keep both the security surface and preview/handling logic bounded.
export const GENERAL_FILE_MIME_TYPES = [
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
] as const;

export const PDF_MIME_TYPE = "application/pdf";

export type UploadableItemType = "pdf" | "image" | "file";

// Derives which of the three upload-based Knowledge Item types a declared MIME type belongs to
// (or null if it's not one this app accepts) — the single source of truth both the client's
// pre-upload check and the server's authoritative one build on.
export function deriveUploadableItemType(mimeType: string): UploadableItemType | null {
  if (mimeType === PDF_MIME_TYPE) return "pdf";
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return "image";
  if ((GENERAL_FILE_MIME_TYPES as readonly string[]).includes(mimeType)) return "file";
  return null;
}

export function maxBytesForType(type: UploadableItemType): number {
  if (type === "pdf") return PDF_MAX_BYTES;
  if (type === "image") return IMAGE_MAX_BYTES;
  return GENERAL_FILE_MAX_BYTES;
}

export function formatMaxSizeLabel(type: UploadableItemType): string {
  return `${Math.round(maxBytesForType(type) / (1024 * 1024))}MB`;
}

// General Files whose content is plain text — File_Uploads.md's Preview section: "where feasible
// (e.g., plain text), an inline preview; otherwise ... metadata ... with a download action."
// Office/archive formats in GENERAL_FILE_MIME_TYPES aren't feasible to render inline without a
// dedicated viewer per format, so this is deliberately narrower than the full allow-list.
const TEXT_PREVIEWABLE_MIME_TYPES = ["text/plain", "text/csv", "text/markdown", "application/json"] as const;

export function isTextPreviewable(mimeType: string): boolean {
  return (TEXT_PREVIEWABLE_MIME_TYPES as readonly string[]).includes(mimeType);
}
