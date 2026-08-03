import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { mergeTagsSchema } from "@/lib/validation/tags";

function mergeFailedResponse() {
  return NextResponse.json(
    { error: { code: "merge_failed", message: "Something went wrong merging these tags." } },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = mergeTagsSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid merge request.",
        },
      },
      { status: 400 },
    );
  }

  const { source_tag_id, target_tag_id } = result.data;

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id")
    .eq("owner_id", user.id)
    .in("id", [source_tag_id, target_tag_id]);

  if (tagsError) {
    console.error("[api/tags/merge] tag lookup failed:", tagsError);
    return mergeFailedResponse();
  }

  if (!tags || tags.length < 2) {
    return NextResponse.json(
      { error: { code: "not_found", message: "One or both tags don't exist." } },
      { status: 404 },
    );
  }

  const { data: sourceLinks, error: linksError } = await supabase
    .from("knowledge_item_tags")
    .select("knowledge_item_id")
    .eq("tag_id", source_tag_id);

  if (linksError) {
    console.error("[api/tags/merge] source link lookup failed:", linksError);
    return mergeFailedResponse();
  }

  // Reassigns every item currently tagged with source onto target. `ignoreDuplicates` handles an
  // item that already carries *both* tags before the merge (e.g. "js" and "javascript" on the
  // same note) — without it, the composite primary key on knowledge_item_tags would reject the
  // insert as a conflict instead of silently treating it as already-merged for that item.
  if (sourceLinks.length > 0) {
    const { error: reassignError } = await supabase.from("knowledge_item_tags").upsert(
      sourceLinks.map((link) => ({
        knowledge_item_id: link.knowledge_item_id,
        tag_id: target_tag_id,
      })),
      { onConflict: "knowledge_item_id,tag_id", ignoreDuplicates: true },
    );

    if (reassignError) {
      console.error("[api/tags/merge] reassign failed:", reassignError);
      return mergeFailedResponse();
    }
  }

  // Deletes the source tag itself — its now-redundant knowledge_item_tags rows cascade away
  // (on delete cascade, 001_initial_schema.sql). A failure here is reported as a distinct error
  // rather than swallowed: items have already been reassigned to target at this point, so a
  // silent "success" would hide that the source tag is still hanging around.
  const { error: deleteError } = await supabase
    .from("tags")
    .delete()
    .eq("id", source_tag_id)
    .eq("owner_id", user.id);

  if (deleteError) {
    console.error("[api/tags/merge] source tag delete failed:", deleteError);
    return NextResponse.json(
      {
        error: {
          code: "merge_incomplete",
          message:
            "Items were reassigned, but the old tag couldn't be removed — try deleting it directly.",
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ merged: true, target_tag_id });
}
