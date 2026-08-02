import { z } from "zod";

export const DEFAULT_NOTE_TITLE = "Untitled Note";

export const itemIdSchema = z.string().uuid();

export const versionIdSchema = z.string().uuid();

export const createNoteSchema = z.object({
  collection_id: z.string().uuid(),
  title: z.string().trim().max(200, "Title is too long").optional(),
  description: z.string().max(50_000, "Note is too long").optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Title is too long").optional(),
    description: z.string().max(50_000, "Note is too long").nullable().optional(),
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

export const listItemsQuerySchema = z.object({
  collection_id: z.string().uuid().optional(),
});

export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
