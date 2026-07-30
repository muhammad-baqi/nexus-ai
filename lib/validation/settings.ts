import { z } from "zod";

// avatar_path is the Storage object path under the private "avatars" bucket (see
// supabase/migrations/002_avatars_storage.sql) — never a public URL. It's persisted into
// profiles.avatar_url and turned back into a short-lived signed URL on read.
export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().max(100).optional(),
  avatar_path: z.string().max(500).nullable().optional(),
  theme_preference: z.enum(THEME_PREFERENCES).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// docs/01_MVP/Settings.md: "Reasonable size/format limits ... (e.g., JPEG/PNG/WebP, a few MB
// max)" — matches the bucket's own file_size_limit/allowed_mime_types in the migration above, so
// the client-side check and the server-side (storage-enforced) limit agree.
export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
