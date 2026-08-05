import { z } from "zod";

import { GENERAL_FILE_MIME_TYPES, IMAGE_MIME_TYPES, PDF_MIME_TYPE } from "@/lib/files/constants";

export const DEFAULT_NOTE_TITLE = "Untitled Note";

// Matches the DB enum knowledge_item_type (001_initial_schema.sql) — only 'note' is buildable
// today, but the filter/search surface is built generically per Search.md's "results spanning
// all item types" requirement, ahead of Day 5 adding the rest.
export const KNOWLEDGE_ITEM_TYPES = [
  "note",
  "website",
  "pdf",
  "image",
  "file",
  "code_snippet",
] as const;

export const SORT_OPTIONS = ["relevance", "updated", "created", "title"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export const itemIdSchema = z.string().uuid();

export const versionIdSchema = z.string().uuid();

// What POST /api/items can create today — note/website (earlier Day 5) plus pdf/image/file
// (this feature). code_snippet exists in the DB enum and the search/filter surface (built ahead
// of its own later Day 5 feature) but has no create path yet.
export const CREATABLE_ITEM_TYPES = ["note", "website", "pdf", "image", "file"] as const;

export const createNoteSchema = z.object({
  type: z.literal("note"),
  collection_id: z.string().uuid(),
  title: z.string().trim().max(200, "Title is too long").optional(),
  description: z.string().max(50_000, "Note is too long").optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const createBookmarkSchema = z.object({
  type: z.literal("website"),
  collection_id: z.string().uuid(),
  url: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .refine((value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Only http and https URLs are supported"),
  // Set on a resubmit after the user dismissed the non-blocking duplicate prompt and chose to
  // save anyway (Website_Bookmarks.md's Duplicate Detection section).
  confirmDuplicate: z.boolean().optional(),
});

export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

const ALL_UPLOAD_MIME_TYPES = [PDF_MIME_TYPE, ...IMAGE_MIME_TYPES, ...GENERAL_FILE_MIME_TYPES] as const;

// The file's bytes are already sitting in Storage by the time this request arrives (uploaded
// directly from the browser, same architecture as avatars — see lib/files/verify-upload.ts's
// comment for why) — this payload is metadata pointing at that upload, not the file itself.
// `type` still has to be one of the three upload types explicitly (not derived from mime_type
// here) so a mismatched pair (e.g. type: "pdf" with an image mime_type) is a validation error the
// route can catch before ever touching Storage.
export const createFileItemSchema = z.object({
  type: z.enum(["pdf", "image", "file"]),
  collection_id: z.string().uuid(),
  storage_path: z.string().min(1).max(1024),
  filename: z.string().trim().min(1, "Filename is required").max(255, "Filename is too long"),
  mime_type: z.enum(ALL_UPLOAD_MIME_TYPES),
  size_bytes: z.number().int().positive(),
});

export type CreateFileItemInput = z.infer<typeof createFileItemSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title is too long").optional(),
    description: z.string().max(50_000, "Note is too long").nullable().optional(),
    is_favorite: z.boolean().optional(),
    is_archived: z.boolean().optional(),
    collection_id: z.string().uuid().optional(),
    // Notes-only: the note_versions row this save should coalesce into (update), echoed back
    // from a previous PATCH's `versionId` response field. Omitted/null opens a new version
    // boundary (insert) instead — see Notes.md's Version History section. Not a knowledge_items
    // column; stripped before the update.
    openVersionId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).some((key) => key !== "openVersionId"), {
    message: "At least one field must be provided.",
  });

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// Query params arrive as strings ("true"/"false") — z.coerce.boolean() is a trap here since
// Boolean("false") === true in JS; this maps the two literal strings explicitly instead.
const booleanParam = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

const dateParam = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .optional();

export const listItemsQuerySchema = z.object({
  collection_id: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  type: z.enum(KNOWLEDGE_ITEM_TYPES).optional(),
  // OR logic within this filter (Search.md) — an item matches if it has any of these tags.
  tag: z.array(z.string().uuid()).optional(),
  favorite: booleanParam,
  archived: booleanParam,
  created_from: dateParam,
  created_to: dateParam,
  sort: z.enum(SORT_OPTIONS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
});

export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const DEFAULT_ITEMS_PAGE_LIMIT = DEFAULT_PAGE_LIMIT;
