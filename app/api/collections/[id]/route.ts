import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { collectionIdSchema, updateCollectionSchema } from "@/lib/validation/collections";

const UNIQUE_VIOLATION_CODE = "23505";
// PostgREST's code for "the .single() query matched zero rows" — either the id doesn't exist,
// belongs to another user (RLS silently excludes it), or was already soft-deleted.
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "Invalid collection id." } },
    { status: 400 },
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!collectionIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading the collection." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!collectionIdSchema.safeParse(id).success) return invalidIdResponse();

  const body = await request.json().catch(() => null);
  const result = updateCollectionSchema.safeParse(body);

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

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("collections")
    .update(result.data)
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return NextResponse.json(
        {
          error: {
            code: "duplicate_name",
            message: "You already have a collection with this name.",
          },
        },
        { status: 409 },
      );
    }
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id] update failed:", error);
    return NextResponse.json(
      { error: { code: "update_failed", message: "Something went wrong updating the collection." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!collectionIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const deletedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("collections")
    .update({ deleted_at: deletedAt })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id] delete failed:", error);
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Something went wrong deleting the collection." } },
      { status: 500 },
    );
  }

  // docs/01_MVP/Collections.md: deleting a Collection moves it AND its items to Trash. No
  // knowledge_items exist yet (they ship Day 3), but this cascade is correct today regardless of
  // row count -- the item-side restore nuance (don't resurrect items trashed before the
  // collection was) is explicitly wired up when Trash/Restore itself ships, per
  // build-order-complete.md step 14. Not wrapped in a DB transaction/RPC: the two updates aren't
  // atomic, but a partial failure here is surfaced to the caller via `itemCascadeIncomplete`
  // rather than silently reported as full success.
  const { error: cascadeError } = await supabase
    .from("knowledge_items")
    .update({ deleted_at: deletedAt })
    .eq("collection_id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  if (cascadeError) {
    console.error("[api/collections/:id] cascading item trash failed:", cascadeError);
    return NextResponse.json({ ...data, itemCascadeIncomplete: true });
  }

  return NextResponse.json(data);
}
