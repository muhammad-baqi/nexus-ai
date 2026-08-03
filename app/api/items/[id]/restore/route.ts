import { NextResponse, type NextRequest } from "next/server";

import { verifyCollectionOwnership } from "@/lib/items/verify-collection-ownership";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

// PostgREST's code for ".single() matched zero rows".
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

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

  // Fetch the trashed row first to know its original collection_id — the restore's target
  // depends on whether that collection is still around, so this can't be a single blind UPDATE
  // the way collections' own restore is.
  const { data: trashedItem, error: fetchError } = await supabase
    .from("knowledge_items")
    .select("collection_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .single();

  if (fetchError) {
    if (fetchError.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item isn't in Trash." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id/restore] prior-state lookup failed:", fetchError);
    return NextResponse.json(
      { error: { code: "restore_failed", message: "Something went wrong restoring the item." } },
      { status: 500 },
    );
  }

  // Knowledge_Items.md: if the item's original Collection was itself deleted (and not restored),
  // restoring the item should re-home it in the user's default Collection rather than failing.
  const originalCollectionLive = await verifyCollectionOwnership(
    supabase,
    trashedItem.collection_id,
    user.id,
  );

  let targetCollectionId = trashedItem.collection_id;
  let rehomed = false;
  // Name of whatever collection the item actually landed in when rehomed — the fallback below
  // doesn't always land in "Inbox", so the client needs the real name rather than assuming it.
  let rehomedToCollectionName: string | undefined;

  if (!originalCollectionLive) {
    // Inbox has no dedicated "is default" marker in the schema — it's identified by name, the
    // same way `handle_new_user`'s seed data and the rest of the app already treat it. But
    // Collections are renamable (Day 2), so a user may well have renamed their actual Inbox —
    // that's a reachable state, not just a theoretical one, so falling through to "no collection
    // to restore into" would be a real dead end. Fall back to the caller's oldest surviving
    // collection instead of failing outright.
    const { data: inbox, error: inboxError } = await supabase
      .from("collections")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("name", "Inbox")
      .is("deleted_at", null)
      .maybeSingle();

    if (inboxError) {
      console.error("[api/items/:id/restore] Inbox lookup failed:", inboxError);
      return NextResponse.json(
        { error: { code: "restore_failed", message: "Something went wrong restoring the item." } },
        { status: 500 },
      );
    }

    let target = inbox;

    if (!target) {
      const { data: oldest, error: oldestError } = await supabase
        .from("collections")
        .select("id, name")
        .eq("owner_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (oldestError) {
        console.error("[api/items/:id/restore] fallback collection lookup failed:", oldestError);
        return NextResponse.json(
          { error: { code: "restore_failed", message: "Something went wrong restoring the item." } },
          { status: 500 },
        );
      }

      target = oldest;
    }

    if (!target) {
      // Should be unreachable in practice — every account has at least the seeded Inbox
      // collection, and collections can be renamed but not all deleted without a replacement
      // existing (there's always at least one to fall back to unless every collection is
      // trashed). Logged loudly since it implies a data-integrity gap worth investigating.
      console.error("[api/items/:id/restore] no live collection found at all for user:", user.id);
      return NextResponse.json(
        {
          error: {
            code: "restore_failed",
            message: "Couldn't find a collection to restore this item into.",
          },
        },
        { status: 500 },
      );
    }

    targetCollectionId = target.id;
    rehomedToCollectionName = target.name;
    rehomed = true;
  }

  const { data, error } = await supabase
    .from("knowledge_items")
    .update({ deleted_at: null, collection_id: targetCollectionId })
    .eq("id", id)
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item isn't in Trash." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id/restore] restore failed:", error);
    return NextResponse.json(
      { error: { code: "restore_failed", message: "Something went wrong restoring the item." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ...data, rehomed, rehomedToCollectionName });
}
