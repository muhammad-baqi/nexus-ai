import { NextResponse, type NextRequest } from "next/server";

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

  return NextResponse.json({ id: data.id, deleted: true });
}
