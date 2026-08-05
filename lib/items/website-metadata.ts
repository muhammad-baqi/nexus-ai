import type { createClient } from "@/lib/supabase/server";

export type WebsiteMetadata = {
  url: string;
  canonical_url: string | null;
  domain: string | null;
  og_image_url: string | null;
  favicon_url: string | null;
  fetch_status: "pending" | "success" | "failed";
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Mirrors lib/items/tags.ts's fetchItemTags shape/error-handling — used by GET /api/items/:id to
// embed a website item's metadata without a second round trip from the caller. `null` return
// means the read itself failed (logged); the caller decides how to degrade, same convention as
// fetchItemTags.
export async function fetchWebsiteMetadata(
  supabase: SupabaseClient,
  itemId: string,
): Promise<WebsiteMetadata | null> {
  const { data, error } = await supabase
    .from("website_metadata")
    .select("url, canonical_url, domain, og_image_url, favicon_url, fetch_status")
    .eq("knowledge_item_id", itemId)
    .maybeSingle();

  if (error) {
    console.error("[lib/items/website-metadata] fetchWebsiteMetadata failed:", error);
    return null;
  }

  return data as WebsiteMetadata | null;
}
