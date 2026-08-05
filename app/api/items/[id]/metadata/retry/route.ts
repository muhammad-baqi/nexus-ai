import { after, NextResponse, type NextRequest } from "next/server";

import { fetchBookmarkMetadata } from "@/lib/bookmarks/fetch-bookmark-metadata";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

// PostgREST's code for ".single() matched zero rows" — either the id doesn't exist, belongs to
// another user (RLS silently excludes it), or was already soft-deleted.
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

// Re-triggers the background metadata fetch (Website_Bookmarks.md: "the user-triggered 'retry
// metadata fetch' action re-enqueues the same job; there is no automatic silent retry loop").
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id, type")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (itemError) {
    if (itemError.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id/metadata/retry] item lookup failed:", itemError);
    return NextResponse.json(
      { error: { code: "retry_failed", message: "Something went wrong retrying the fetch." } },
      { status: 500 },
    );
  }

  if (item.type !== "website") {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Only bookmarks support a metadata retry." } },
      { status: 400 },
    );
  }

  const { data: metadata, error: metadataError } = await supabase
    .from("website_metadata")
    .update({ fetch_status: "pending" })
    .eq("knowledge_item_id", id)
    .select("url, canonical_url, domain, og_image_url, favicon_url, fetch_status")
    .single();

  if (metadataError) {
    console.error("[api/items/:id/metadata/retry] status reset failed:", metadataError);
    return NextResponse.json(
      { error: { code: "retry_failed", message: "Something went wrong retrying the fetch." } },
      { status: 500 },
    );
  }

  after(() => fetchBookmarkMetadata(supabase, id, metadata.url));

  return NextResponse.json({ ...item, website_metadata: metadata });
}
