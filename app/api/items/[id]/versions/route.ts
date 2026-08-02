import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { itemIdSchema } from "@/lib/validation/items";

const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "Invalid item id." } },
    { status: 400 },
  );
}

function notFoundResponse() {
  return NextResponse.json(
    { error: { code: "not_found", message: "This item was already removed." } },
    { status: 404 },
  );
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!itemIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  // Explicit ownership check (not just relying on note_versions' RLS returning an empty list)
  // so a foreign/nonexistent item id 404s instead of looking identical to "no versions yet".
  const { data: item, error: itemError } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (itemError || !item) {
    if (itemError && itemError.code !== NO_ROWS_CODE) {
      console.error("[api/items/:id/versions] item lookup failed:", itemError);
    }
    return notFoundResponse();
  }

  const { data, error } = await supabase
    .from("note_versions")
    .select("id, created_at")
    .eq("knowledge_item_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/items/:id/versions] list failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading version history." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
