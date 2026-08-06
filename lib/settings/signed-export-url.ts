import { DATA_JOBS_STORAGE_BUCKET } from "@/lib/settings/constants";
import type { createClient } from "@/lib/supabase/server";

// Mirrors lib/files/signed-url.ts's signFileUrl — the data-jobs bucket stays private-by-default,
// same as every other Storage bucket in this app, so a completed export is only ever reachable via
// a freshly-signed, short-lived URL, not a stored/public one.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function signExportUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DATA_JOBS_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("[signExportUrl] createSignedUrl failed:", error);
    return null;
  }

  return data.signedUrl;
}
