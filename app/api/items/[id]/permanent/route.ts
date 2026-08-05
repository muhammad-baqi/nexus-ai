import { NextResponse, type NextRequest } from "next/server";

import { deleteUploadedObject } from "@/lib/files/verify-upload";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

// PostgREST's code for ".single() matched zero rows".
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
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

  // Fetched *before* the delete below — file_assets cascades away with the knowledge_items row
  // (001_initial_schema.sql's `on delete cascade`), so its storage_path has to be captured first
  // or there'd be nothing left to point the Storage cleanup at. Only pdf/image/file items ever
  // have a row here (a lookup miss just skips cleanup below); file_assets' own RLS
  // (001_initial_schema.sql) already scopes this to the caller's own items via
  // knowledge_items.owner_id, same as every other read in this route file.
  const { data: fileAsset } = await supabase
    .from("file_assets")
    .select("storage_path")
    .eq("knowledge_item_id", id)
    .maybeSingle();

  // Only permanently deletable *from* Trash (Knowledge_Items.md) — this guard also means a
  // still-active item can never be hard-deleted through this route by mistake.
  const { data, error } = await supabase
    .from("knowledge_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .not("deleted_at", "is", null)
    .select("id")
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This item isn't in Trash." } },
        { status: 404 },
      );
    }
    console.error("[api/items/:id/permanent] delete failed:", error);
    return NextResponse.json(
      {
        error: {
          code: "delete_failed",
          message: "Something went wrong permanently deleting the item.",
        },
      },
      { status: 500 },
    );
  }

  // Best-effort, after the DB row is confirmed gone — File_Uploads.md: "permanent deletion
  // removes the underlying Storage object." A failed cleanup here shouldn't fail the delete
  // itself (the item is already gone from the user's perspective); logged for a future sweep,
  // same as the upload-time orphan-cleanup path.
  if (fileAsset?.storage_path) {
    await deleteUploadedObject(supabase, fileAsset.storage_path);
  }

  return NextResponse.json({ id: data.id, deleted: true });
}
