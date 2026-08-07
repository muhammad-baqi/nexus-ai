import type { createClient } from "@/lib/supabase/server";

export type ItemShareLink = { token: string; url: string } | null;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export function itemShareUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/share/${token}`;
}

// Mirrors lib/items/website-metadata.ts's fetchWebsiteMetadata shape/error-handling — used by
// GET /api/items/:id to embed whether this item currently has an active share link, without a
// second round trip from the caller. `null` covers both "read failed" (logged) and "genuinely no
// active link" — the client only uses this to render current share state, not to distinguish the
// two, so unlike fetchItemTags there's no need for a three-way null/empty/failed signal here.
export async function fetchActiveShareLink(
  supabase: SupabaseClient,
  itemId: string,
): Promise<ItemShareLink> {
  const { data, error } = await supabase
    .from("share_links")
    .select("token")
    .eq("knowledge_item_id", itemId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[lib/items/share-link] fetchActiveShareLink failed:", error);
    return null;
  }

  return data ? { token: data.token, url: itemShareUrl(data.token) } : null;
}
