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

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "This version couldn't be found." } },
    { status: 404 },
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id, versionId } = await params;
  if (!itemIdSchema.safeParse(id).success || !versionIdSchema.safeParse(versionId).success) {
    return invalidIdResponse();
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Explicit ownership + not-trashed check on the item itself: RLS on note_versions only
  // proves same-user ownership (not "this specific item", nor "not trashed") — a trashed note's
  // old content shouldn't stay readable via a versionId the client fetched before it was
  // trashed (docs/01_MVP/Knowledge_Items.md: a trashed item should show "no longer available").
  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (itemError || !item) {
    if (itemError && itemError.code !== NO_ROWS_CODE) {
      console.error("[api/items/:id/versions/:versionId] item lookup failed:", itemError);
    }
    return notFoundResponse();
  }

  // Scoped by BOTH versionId and knowledge_item_id — a version id from one of the caller's own
  // other notes must not resolve here.
  const { data, error } = await supabase
    .from("note_versions")
    .select("id, content, created_at")
    .eq("id", versionId)
    .eq("knowledge_item_id", id)
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) return notFoundResponse();
    console.error("[api/items/:id/versions/:versionId] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading this version." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
