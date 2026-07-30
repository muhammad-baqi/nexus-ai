import { NextResponse, type NextRequest } from "next/server";

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

  return NextResponse.json(data);
}

