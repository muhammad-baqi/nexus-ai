import { NextResponse, type NextRequest } from "next/server";

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

  return NextResponse.json(data);
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

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("knowledge_items")
    .update(result.data)
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
    console.error("[api/items/:id] update failed:", error);
    return NextResponse.json(
      { error: { code: "update_failed", message: "Something went wrong updating the item." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
