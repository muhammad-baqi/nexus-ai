import { z } from "zod";

export const tagIdSchema = z.string().uuid();

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(50, "Tag name is too long");

export const updateTagSchema = z.object({
  name: tagNameSchema,
});

export type UpdateTagInput = z.infer<typeof updateTagSchema>;

export const mergeTagsSchema = z
  .object({
    source_tag_id: tagIdSchema,
    target_tag_id: tagIdSchema,
  })
  .refine((data) => data.source_tag_id !== data.target_tag_id, {
    message: "Cannot merge a tag into itself.",
    path: ["target_tag_id"],
  });

export type MergeTagsInput = z.infer<typeof mergeTagsSchema>;

export const addItemTagSchema = z.object({
  name: tagNameSchema,
});

export type AddItemTagInput = z.infer<typeof addItemTagSchema>;
