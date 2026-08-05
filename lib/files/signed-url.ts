import type { createClient } from "@/lib/supabase/server";
import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";

// Mirrors lib/supabase/avatar.ts's signAvatarUrl — files stay private-by-default in Storage
// (File_Uploads.md's Security Requirements), so every read path signs a fresh, short-lived URL
// rather than storing/serving a public one. 10 minutes rather than avatars' 1 hour: a file's
// signed URL is embedded directly in the PDF-viewer iframe / image `src` / download link on
// every item-detail page load, not cached across a long settings-page session.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function signFileUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(FILES_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("[signFileUrl] createSignedUrl failed:", error);
    return null;
  }

  return data.signedUrl;
}
