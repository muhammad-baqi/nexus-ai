import { NextResponse, type NextRequest } from "next/server";

import { logActivity } from "@/lib/activity/log-activity";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { collectionIdSchema } from "@/lib/validation/collections";

const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!collectionIdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid collection id." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Captured before the restore clears it: DELETE stamps a collection's items with the exact
  // same deleted_at as the collection itself (app/api/collections/[id]/route.ts's cascade), so
  // this is how the cascade-restore below tells "trashed together with this collection" apart
  // from an item the user had already trashed individually beforehand.
  const { data: trashedCollection, error: lookupError } = await supabase
    .from("collections")
    .select("deleted_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .single();

  if (lookupError) {
    if (lookupError.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection isn't in Trash." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id/restore] lookup failed:", lookupError);
    return NextResponse.json(
      { error: { code: "restore_failed", message: "Something went wrong restoring the collection." } },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("collections")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection isn't in Trash." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id/restore] restore failed:", error);
    return NextResponse.json(
      { error: { code: "restore_failed", message: "Something went wrong restoring the collection." } },
      { status: 500 },
    );
  }

  // Not wrapped in a DB transaction/RPC, same tradeoff DELETE's own cascade already makes: a
  // partial failure here is surfaced via `itemCascadeIncomplete` rather than silently reported
  // as full success.
  const { error: cascadeError } = await supabase
    .from("knowledge_items")
    .update({ deleted_at: null })
    .eq("collection_id", id)
    .eq("owner_id", user.id)
    .eq("deleted_at", trashedCollection.deleted_at);

  if (cascadeError) {
    console.error("[api/collections/:id/restore] cascading item restore failed:", cascadeError);
    await logActivity(supabase, { ownerId: user.id, action: "restored", collectionId: id });
    return NextResponse.json({ ...data, itemCascadeIncomplete: true });
  }

  await logActivity(supabase, { ownerId: user.id, action: "restored", collectionId: id });
  return NextResponse.json(data);
}

