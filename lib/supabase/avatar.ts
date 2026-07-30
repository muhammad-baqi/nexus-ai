import type { createClient } from "@/lib/supabase/server";

export const AVATAR_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Shared by app/api/settings/route.ts and app/(app)/settings/page.tsx so the bucket name and TTL
// can't drift between the two read paths (API PATCH response vs. the page's initial render).
export async function signAvatarUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  avatarPath: string | null,
) {
  if (!avatarPath) return null;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("[avatar] createSignedUrl failed:", error);
    return null;
  }

  return data.signedUrl;
}
