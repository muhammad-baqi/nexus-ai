import { NextResponse, type NextRequest } from "next/server";

import { fetchItemTags, getOrCreateTag } from "@/lib/items/tags";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";
import { addItemTagSchema } from "@/lib/validation/tags";

type RouteParams = { params: Promise<{ id: string }> };

function tagFailedResponse() {
  return NextResponse.json(
    { error: { code: "tag_failed", message: "Something went wrong tagging this item." } },
    { status: 500 },
  );
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid item id." } },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const result = addItemTagSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid tag name.",
        },
      },
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
    console.error("[api/items/:id/tags] item lookup failed:", itemError);
    return tagFailedResponse();
  }

  if (!item) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This item doesn't exist." } },
      { status: 404 },
    );
  }

  const tag = await getOrCreateTag(supabase, user.id, result.data.name);
  if (!tag) return tagFailedResponse();

  // Attaching an already-attached tag is a no-op, not an error — the composite primary key
  // would otherwise reject a duplicate re-add.
  const { error: attachError } = await supabase
    .from("knowledge_item_tags")
    .upsert(
      { knowledge_item_id: id, tag_id: tag.id },
      { onConflict: "knowledge_item_id,tag_id", ignoreDuplicates: true },
    );

  if (attachError) {
    console.error("[api/items/:id/tags] attach failed:", attachError);
    return tagFailedResponse();
  }

  // The attach above already succeeded — if this re-read fails, `tags` comes back `null` rather
  // than `[]`, and `tag` (the one just attached) is included too, so the client can optimistically
  // merge it into its own known list instead of overwriting a good list with a misleadingly empty
  // one (self-review-caught gap: a transient read failure right after a successful attach was
  // silently reported as "this item now has zero tags").
  const tags = await fetchItemTags(supabase, id);
  return NextResponse.json({ tag, tags }, { status: 201 });
}
