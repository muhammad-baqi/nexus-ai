import { NextResponse, type NextRequest } from "next/server";

import { fetchItemTags } from "@/lib/items/tags";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";
import { tagIdSchema } from "@/lib/validation/tags";

type RouteParams = { params: Promise<{ id: string; tagId: string }> };

function untagFailedResponse() {
  return NextResponse.json(
    { error: { code: "untag_failed", message: "Something went wrong removing this tag." } },
    { status: 500 },
  );
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id, tagId } = await params;
  if (!itemIdSchema.safeParse(id).success || !tagIdSchema.safeParse(tagId).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item or tag id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (itemError) {
    console.error("[api/items/:id/tags/:tagId] item lookup failed:", itemError);
    return untagFailedResponse();
  }

  if (!item) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  // Detaching a tag that isn't currently attached is a no-op success, not a 404 — matching the
  // rest of this app's idempotent-delete convention (e.g. permanent delete on an already-gone
  // item).
  const { error: detachError } = await supabase
    .from("knowledge_item_tags")
    .delete()
    .eq("knowledge_item_id", id)
    .eq("tag_id", tagId);

  if (detachError) {
    console.error("[api/items/:id/tags/:tagId] detach failed:", detachError);
    return untagFailedResponse();
  }

  // The detach above already succeeded — if this re-read fails, `tags` comes back `null` rather
  // than `[]`, so the client doesn't overwrite its (already-optimistically-updated) list with a
  // misleadingly empty one (same self-review-caught gap as the attach route above).
  const tags = await fetchItemTags(supabase, id);
  return NextResponse.json({ tags });
}
