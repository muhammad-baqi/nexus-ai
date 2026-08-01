import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { createNoteSchema, DEFAULT_NOTE_TITLE, listItemsQuerySchema } from "@/lib/validation/items";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = listItemsQuerySchema.safeParse({
    collection_id: searchParams.get("collection_id") ?? undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "Invalid query parameters." } },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Skips `description` (the note body, up to 50,000 chars) — this list is just for navigation,
  // not display, so there's no reason to ship the full body over the wire for every row.
  let query = supabase
    .from("knowledge_items")
    .select("id, owner_id, collection_id, type, title, is_favorite, is_archived, created_at, updated_at")
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  if (result.data.collection_id) {
    query = query.eq("collection_id", result.data.collection_id);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/items] list failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading items." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: data });
}

// Only Notes can be created today — a `type` discriminator gets added once Website
// Bookmarks/Files/etc. ship (Day 5), not pre-built now for a type that doesn't exist yet.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = createNoteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid note.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // The RLS policy on knowledge_items only checks owner_id = auth.uid() on the row being
  // inserted — it doesn't (and can't, from an insert) verify collection_id belongs to that same
  // owner. Without this check, a caller could attach a note to another user's collection (or one
  // they've already trashed) just by guessing/enumerating a UUID.
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", result.data.collection_id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (collectionError || !collection) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This collection doesn't exist." } },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("knowledge_items")
    .insert({
      owner_id: user.id,
      collection_id: result.data.collection_id,
      type: "note",
      title: result.data.title || DEFAULT_NOTE_TITLE,
      description: result.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/items] create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong creating the note." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
