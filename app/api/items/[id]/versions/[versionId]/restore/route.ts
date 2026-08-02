import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema, versionIdSchema } from "@/lib/validation/items";

const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string; versionId: string }> };

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "Invalid item or version id." } },
    { status: 400 },
  );
}

function notFoundResponse(message: string) {
  return NextResponse.json({ error: { code: "not_found", message } }, { status: 404 });
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id, versionId } = await params;
  if (!itemIdSchema.safeParse(id).success || !versionIdSchema.safeParse(versionId).success) {
    return invalidIdResponse();
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data: version, error: versionError } = await supabase
    .from("note_versions")
    .select("content")
    .eq("id", versionId)
    .eq("knowledge_item_id", id)
    .single();

  if (versionError) {
    if (versionError.code === NO_ROWS_CODE) {
      return notFoundResponse("This version couldn't be found.");
    }
    console.error("[api/items/:id/versions/:versionId/restore] version lookup failed:", versionError);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading this version." } },
      { status: 500 },
    );
  }

  // Belt-and-suspenders: note_versions rows are only ever written for notes (enforced in
  // PATCH /api/items/:id), so this should be unreachable in practice — but restoring onto a
  // non-note item would be a meaningless write, so check before mutating anything.
  const { data: existingItem, error: existingItemError } = await supabase
    .from("knowledge_items")
    .select("type")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (existingItemError || existingItem.type !== "note") {
    if (existingItemError && existingItemError.code !== NO_ROWS_CODE) {
      console.error(
        "[api/items/:id/versions/:versionId/restore] item lookup failed:",
        existingItemError,
      );
    }
    return notFoundResponse("This item was already removed.");
  }

  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .update({ description: version.content })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (itemError) {
    if (itemError.code === NO_ROWS_CODE) {
      return notFoundResponse("This item was already removed.");
    }
    console.error("[api/items/:id/versions/:versionId/restore] item update failed:", itemError);
    return NextResponse.json(
      { error: { code: "restore_failed", message: "Something went wrong restoring this version." } },
      { status: 500 },
    );
  }

  // A new version entry, not a reuse of the restored one — restoring never deletes/overwrites
  // history (Notes.md). Non-fatal: the restore's actual effect (the content) already landed
  // above; losing this bookkeeping entry is a degraded-but-recoverable outcome, not a failure.
  // `versionId: null` in the response tells the client this failed, so its *next* autosave
  // opens a fresh boundary instead of guessing at (and potentially corrupting) some other row.
  const { data: newVersion, error: versionWriteError } = await supabase
    .from("note_versions")
    .insert({ knowledge_item_id: id, content: version.content })
    .select("id")
    .single();
  if (versionWriteError) {
    console.error(
      "[api/items/:id/versions/:versionId/restore] new version entry insert failed:",
      versionWriteError,
    );
  }

  return NextResponse.json({ ...item, versionId: newVersion?.id ?? null });
}
