import type { createClient } from "@/lib/supabase/server";
import { parseHtmlMetadata } from "@/lib/bookmarks/parse-html-metadata";
import { readBodyWithLimit, safeFetch } from "@/lib/bookmarks/safe-fetch";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB — plenty for real page HTML, caps a malicious/huge response

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// The background job itself (Website_Bookmarks.md's Background Job Requirements) — fetches the
// saved URL, extracts metadata, and writes it. Called via `after()` from the route that creates
// (or retries) a bookmark, so it always runs *after* the HTTP response that created the item has
// already been sent (CLAUDE.md rule #5). Never throws: every failure path (network error,
// timeout, non-HTML response, a DB write failure) is caught and recorded as
// `fetch_status: 'failed'` instead — a failed enhancement must never surface as an application
// error (CLAUDE.md rule #7), and there's no caller left listening for a thrown error by the time
// this runs anyway.
export async function fetchBookmarkMetadata(
  supabase: SupabaseClient,
  itemId: string,
  url: string,
): Promise<void> {
  try {
    const { response, finalUrl } = await safeFetch(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { "User-Agent": "NexusBot/1.0 (+bookmark metadata fetch)" },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.toLowerCase().includes("html")) {
      await markFailed(supabase, itemId);
      return;
    }

    const html = await readBodyWithLimit(response, MAX_BODY_BYTES);
    // finalUrl reflects the URL that actually produced this response, after any redirects were
    // followed (validated hop-by-hop by safeFetch) — used as the base for resolving relative
    // links/favicon/canonical and for the domain, per Website_Bookmarks.md's "handle ...
    // redirects" requirement.
    const metadata = parseHtmlMetadata(html, finalUrl);
    const domain = new URL(finalUrl).hostname;

    const { error: metadataError } = await supabase
      .from("website_metadata")
      .update({
        canonical_url: metadata.canonicalUrl,
        domain,
        og_image_url: metadata.ogImageUrl,
        favicon_url: metadata.faviconUrl,
        fetch_status: "success",
      })
      .eq("knowledge_item_id", itemId);

    if (metadataError) {
      console.error("[fetchBookmarkMetadata] website_metadata update failed:", metadataError);
      return;
    }

    if (metadata.title) {
      // Only overwrite the title if it's still the placeholder set at creation (the raw URL) —
      // if the user already edited it while this job was in flight, their edit wins.
      const { error: titleError } = await supabase
        .from("knowledge_items")
        .update({ title: metadata.title })
        .eq("id", itemId)
        .eq("title", url);

      if (titleError) {
        console.error("[fetchBookmarkMetadata] title update failed:", titleError);
      }
    }
  } catch (error) {
    console.error("[fetchBookmarkMetadata] fetch failed:", error);
    await markFailed(supabase, itemId);
  }
}

async function markFailed(supabase: SupabaseClient, itemId: string): Promise<void> {
  const { error } = await supabase
    .from("website_metadata")
    .update({ fetch_status: "failed" })
    .eq("knowledge_item_id", itemId);
  if (error) {
    console.error("[fetchBookmarkMetadata] marking failed status failed:", error);
  }
}
