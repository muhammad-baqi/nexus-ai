import { z } from "zod";

// docs/01_MVP/Collections.md: color and icon are each picked from a fixed set, not free text.
export const COLLECTION_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
] as const;

export const COLLECTION_ICONS = [
  "folder",
  "book",
  "briefcase",
  "code",
  "heart",
  "star",
  "home",
  "lightbulb",
  "map",
  "music",
] as const;

export const DEFAULT_COLLECTION_COLOR: (typeof COLLECTION_COLORS)[number] = "gray";
export const DEFAULT_COLLECTION_ICON: (typeof COLLECTION_ICONS)[number] = "folder";

export const collectionIdSchema = z.string().uuid();

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().trim().max(500).optional(),
  color: z.enum(COLLECTION_COLORS).optional(),
  icon: z.enum(COLLECTION_ICONS).optional(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: z.enum(COLLECTION_COLORS).optional(),
    icon: z.enum(COLLECTION_ICONS).optional(),
    is_favorite: z.boolean().optional(),
    is_archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

// "trashed" is a separate view from "active"/"archived" — a trashed collection is always
// excluded from both regardless of its own is_archived flag (docs/01_MVP/Collections.md: trashed
// items are excluded from all default/archived views, restorable only from Trash).
export const listCollectionsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  view: z.enum(["active", "archived", "trashed"]).optional().default("active"),
});

export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;
