import { deriveUploadableItemType, formatMaxSizeLabel, maxBytesForType, type UploadableItemType } from "@/lib/files/constants";

export type FileUploadValidation =
  | { valid: true; type: UploadableItemType }
  | { valid: false; error: string };

// Pure/isomorphic so both the upload form (immediate client-side feedback) and the create route
// (authoritative server-side check) validate a declared { mimeType, sizeBytes } pair identically
// — File_Uploads.md's Shared Upload Requirements explicitly calls out that these must agree.
export function validateFileUpload(input: { mimeType: string; sizeBytes: number }): FileUploadValidation {
  const type = deriveUploadableItemType(input.mimeType);
  if (!type) {
    return {
      valid: false,
      error: `"${input.mimeType || "unknown"}" isn't a supported file type. Supported: PDF, JPEG/PNG/WebP/GIF images, and common document/spreadsheet/archive/text files.`,
    };
  }

  const max = maxBytesForType(type);
  if (input.sizeBytes > max) {
    return {
      valid: false,
      error: `This file is too large — the limit for this type is ${formatMaxSizeLabel(type)}.`,
    };
  }

  if (input.sizeBytes <= 0) {
    return { valid: false, error: "This file is empty." };
  }

  return { valid: true, type };
}
