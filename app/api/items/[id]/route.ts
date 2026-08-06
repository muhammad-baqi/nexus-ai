import { NextResponse, type NextRequest } from "next/server";

import { fetchCodeSnippetData } from "@/lib/items/code-snippet";
import { fetchFileAsset } from "@/lib/items/file-asset";
import { fetchItemTags } from "@/lib/items/tags";
import { verifyCollectionOwnership } from "@/lib/items/verify-collection-ownership";
import { fetchWebsiteMetadata } from "@/lib/items/website-metadata";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema, updateItemSchema } from "@/lib/validation/items";

// PostgREST's code for "the .single() query matched zero rows" — either the id doesn't exist,
// belongs to another user (RLS silently excludes it), or was already soft-deleted.
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "Invalid item id." } },
    { status: 400 },
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("knowledge_items")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading the item." } },
      { status: 500 },
    );
  }

  // tags is `null` only when the read itself failed (fetchItemTags logs the cause) — passed
  // through as `null` rather than coalesced to `[]`, so the client can tell "this item genuinely
  // has no tags" from "couldn't confirm" and avoid overwriting a good local list with a
  // misleadingly empty one (self-review-caught gap).
  const tags = await fetchItemTags(supabase, id);

  // Dashboard.md's "Recently Viewed" tracks opening an item, distinct from editing it — recorded
  // here since this GET is the one request every item-open goes through. Best-effort: a failed
  // view record must never fail the item load itself (CLAUDE.md rule 7).
  const { error: viewError } = await supabase
    .from("item_views")
    .upsert(
      { knowledge_item_id: id, owner_id: user.id, viewed_at: new Date().toISOString() },
      { onConflict: "knowledge_item_id,owner_id" },
    );
  if (viewError) {
    console.error("[api/items/:id] recording view failed:", viewError);
  }

  // Only website items have a website_metadata row, only pdf/image/file items have a file_assets
  // row — an extra query for either on every other type would be wasted work for the common
  // (note) case.
  const website_metadata =
    data.type === "website" ? await fetchWebsiteMetadata(supabase, id) : undefined;
  const file_asset =
    data.type === "pdf" || data.type === "image" || data.type === "file"
      ? await fetchFileAsset(supabase, id)
      : undefined;
  const code_snippet_data =
    data.type === "code_snippet" ? await fetchCodeSnippetData(supabase, id) : undefined;

  return NextResponse.json({
    ...data,
    tags,
    ...(website_metadata !== undefined && { website_metadata }),
    ...(file_asset !== undefined && { file_asset }),
    ...(code_snippet_data !== undefined && { code_snippet_data }),
  });
}

// Inserts a new note_versions row, or updates the caller-specified *currently open* one in
// place, per Notes.md's Version History coalescing rule. Deliberately keyed by an explicit
// version id supplied by the client (echoed back from the previous save's response) rather than
// "whichever row has the newest created_at" — inferring "latest" would let a coalescing update
// silently land on the WRONG row (and corrupt an unrelated, genuinely-historical version)
// whenever a previous boundary-opening write failed to actually insert its row (self-review
// caught this as a real, not just theoretical, data-integrity bug). Returns the id of the
// version row that now holds this content, or null if the write failed — never throws, since a
// lost history entry shouldn't fail the save that already succeeded (CLAUDE.md rule 7).
async function writeNoteVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  content: string,
  openVersionId: string | null,
): Promise<string | null> {
  try {
    if (openVersionId) {
      const { data, error } = await supabase
        .from("note_versions")
        .update({ content })
        .eq("id", openVersionId)
        .eq("knowledge_item_id", itemId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      // A match means the coalesce succeeded. No match (id didn't belong to this item, or
      // never actually existed because an earlier write failed) falls through to insert a
      // fresh row instead of silently doing nothing.
      if (data) return data.id;
    }

    const { data, error } = await supabase
      .from("note_versions")
      .insert({ knowledge_item_id: itemId, content })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error("[api/items/:id] version write failed:", error);
    return null;
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) return invalidIdResponse();

  const body = await request.json().catch(() => null);
  const result = updateItemSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid update.",
        },
      },
      { status: 400 },
    );
  }

  // language/code_content aren't knowledge_items columns (like openVersionId) — pulled out here
  // and written to code_snippet_data separately, further down.
  const { openVersionId, language, code_content, ...itemFields } = result.data;
  const hasKnowledgeItemFields = Object.keys(itemFields).length > 0;

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Moving an item to a different collection: the target must belong to this same caller and
  // not be trashed — see verifyCollectionOwnership's comment for why RLS alone can't guarantee
  // that here (same gap POST /api/items's create path already has to guard against).
  if (itemFields.collection_id) {
    const ownsCollection = await verifyCollectionOwnership(supabase, itemFields.collection_id, user.id);
    if (!ownsCollection) {
      // Distinct code from the item's own not_found below — same 404 status, but this endpoint
      // can now fail to find either the item or the move's target collection, and the client
      // needs to tell the two apart (e.g. to refresh the collection list, not the item itself).
      return NextResponse.json(
        { error: { code: "collection_not_found", message: "This collection doesn't exist." } },
        { status: 404 },
      );
    }
  }

  // Needed to know whether this PATCH's description actually changed (the client always sends
  // title+description together, whichever one changed), whether this item is a note at all
  // — note_versions only applies to notes — and (code_snippet-only) what type this item is, to
  // gate the code_snippet_data write below to snippet items.
  let previousDescription: string | null = null;
  let itemType: string | null = null;
  if ("description" in itemFields || language !== undefined || code_content !== undefined) {
    const { data: existing, error: existingError } = await supabase
      .from("knowledge_items")
      .select("description, type")
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .single();
    if (existingError) {
      console.error("[api/items/:id] prior-state lookup failed:", existingError);
    }
    previousDescription = existing?.description ?? null;
    itemType = existing?.type ?? null;
  }

  // A code_snippet-only PATCH (just language/code_content, no knowledge_items column changed)
  // leaves itemFields empty — an empty PostgREST PATCH body isn't safe to send, so re-select the
  // row instead of updating it in that case.
  const { data, error } = hasKnowledgeItemFields
    ? await supabase
        .from("knowledge_items")
        .update(itemFields)
        .eq("id", id)
        .eq("owner_id", user.id)
        .is("deleted_at", null)
        .select()
        .single()
    : await supabase
        .from("knowledge_items")
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .is("deleted_at", null)
        .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id] update failed:", error);
    return NextResponse.json(
      { error: { code: "update_failed", message: "Something went wrong updating the item." } },
      { status: 500 },
    );
  }

  let versionId: string | null = null;
  if (
    itemType === "note" &&
    typeof data.description === "string" &&
    data.description !== previousDescription
  ) {
    versionId = await writeNoteVersion(supabase, id, data.description, openVersionId ?? null);
  }

  // See the GET handler above: `null` (read failed) is passed through distinctly from `[]`
  // (genuinely no tags) so the client doesn't clobber its tag list on every autosave/toggle.
  const tags = await fetchItemTags(supabase, id);

  let code_snippet_data: { language: string; code_content: string } | undefined;
  if (itemType === "code_snippet" && (language !== undefined || code_content !== undefined)) {
    const snippetPatch: Record<string, string> = {};
    if (language !== undefined) snippetPatch.language = language;
    if (code_content !== undefined) snippetPatch.code_content = code_content;

    const { data: updatedSnippet, error: snippetError } = await supabase
      .from("code_snippet_data")
      .update(snippetPatch)
      .eq("knowledge_item_id", id)
      .select("language, code_content")
      .single();

    if (snippetError) {
      // Unlike note_versions above (history bookkeeping — the current state is already saved
      // regardless of whether its history entry recorded), code_snippet_data IS the item's
      // current content: there's no fallback state to degrade to. A failed write here means the
      // user's edited code is gone with nothing to show for it, so this must fail loudly
      // (CLAUDE.md rule 4) rather than return 200 with the edit silently dropped.
      console.error("[api/items/:id] code_snippet_data update failed:", snippetError);
      return NextResponse.json(
        { error: { code: "update_failed", message: "Something went wrong saving this snippet's code." } },
        { status: 500 },
      );
    }
    code_snippet_data = updatedSnippet;
  }

  return NextResponse.json({
    ...data,
    tags,
    versionId,
    ...(code_snippet_data !== undefined && { code_snippet_data }),
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("knowledge_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id] delete failed:", error);
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Something went wrong deleting the item." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
