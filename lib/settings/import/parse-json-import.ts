import { z } from "zod";

import { COLLECTION_COLORS, COLLECTION_ICONS } from "@/lib/validation/collections";
import { createBookmarkSchema } from "@/lib/validation/items";
import { tagNameSchema } from "@/lib/validation/tags";

// Mirrors build-json-export.ts's ExportBundle shape — this is a round-trip format this app
// controls both ends of, not a general-purpose import of arbitrary third-party JSON. Item
// validation is deliberately kept separate from collection validation (items left as z.unknown()
// at the collection level, parsed individually in lib/settings/jobs/run-import-job.ts) so one
// malformed item never fails the whole collection/job — Settings.md: "Malformed or partially
// invalid import files should not fail the whole job."
export const IMPORTABLE_ITEM_TYPES = ["note", "website", "pdf", "image", "file", "code_snippet"] as const;

// Same field-level limits every other create/update path in this app enforces (createNoteSchema/
// createCodeSnippetSchema/updateItemSchema, lib/validation/items.ts) — an import file is untrusted
// input just like any other request body, not exempt from the caps that keep column sizes sane.
const createdAtSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .optional();

// createBookmarkSchema.shape.url is the same schema real bookmark creation enforces — requires a
// well-formed http(s) URL and explicitly rejects other schemes (e.g. `javascript:`). Reusing it
// here (rather than a bare z.string()) is security-relevant, not just consistency: an imported
// website item's url is later rendered as a real anchor href (components/bookmarks/bookmark-view.tsx),
// and this app has no CSP to fall back on — a crafted import file is exactly the kind of untrusted
// input that field needs to reject the same way a real bookmark submission already does.
const importedUrlSchema = createBookmarkSchema.shape.url;

export const exportedItemSchema = z.object({
  type: z.enum(IMPORTABLE_ITEM_TYPES),
  title: z.string().trim().min(1).max(200, "Title is too long"),
  description: z.string().max(50_000, "Description is too long").nullable().optional(),
  is_favorite: z.boolean().optional().default(false),
  is_archived: z.boolean().optional().default(false),
  created_at: createdAtSchema,
  tags: z.array(tagNameSchema).max(50).optional().default([]),
  note: z.object({ content: z.string().max(50_000, "Note is too long") }).optional(),
  website: z
    .object({
      url: importedUrlSchema,
      canonical_url: z.string().nullable().optional(),
      domain: z.string().nullable().optional(),
      og_image_url: z.string().nullable().optional(),
      favicon_url: z.string().nullable().optional(),
    })
    .optional(),
  file: z
    .object({
      original_filename: z.string().max(255),
      mime_type: z.string(),
      size_bytes: z.number(),
    })
    .optional(),
  code_snippet: z
    .object({
      language: z.string().trim().min(1).max(50, "Unrecognized language"),
      code_content: z.string().max(500_000, "Snippet is too long"),
    })
    .optional(),
});

export type ExportedItemInput = z.infer<typeof exportedItemSchema>;

const exportedCollectionSchema = z.object({
  name: z.string().trim().min(1).max(100, "Name is too long"),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.enum(COLLECTION_COLORS).nullable().optional(),
  icon: z.enum(COLLECTION_ICONS).nullable().optional(),
  is_favorite: z.boolean().optional().default(false),
  is_archived: z.boolean().optional().default(false),
  items: z.array(z.unknown()).optional().default([]),
});

export const exportBundleSchema = z.object({
  exported_at: z.string().optional(),
  collections: z.array(exportedCollectionSchema),
});
