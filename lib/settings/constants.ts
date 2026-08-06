export const DATA_JOBS_STORAGE_BUCKET = "data-jobs";

// Reuses File_Uploads.md's general-file cap (lib/files/constants.ts's GENERAL_FILE_MAX_BYTES) as
// the import-source-upload limit — an exported bundle is JSON/ZIP text+metadata, not raw binary
// content, so the same "middle ground" number that already governs general file uploads is a
// reasonable ceiling here too (Settings.md leaves the exact number unspecified).
export const IMPORT_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export const IMPORT_SOURCE_MIME_TYPES = ["application/json", "application/zip"] as const;
