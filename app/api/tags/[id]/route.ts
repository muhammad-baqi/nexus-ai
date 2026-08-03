import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { tagIdSchema, updateTagSchema } from "@/lib/validation/tags";

const UNIQUE_VIOLATION_CODE = "23505";
// PostgREST's code for "the .single() query matched zero rows" — either the id doesn't exist or
// belongs to another user (RLS silently excludes it).
const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

function invalidIdResponse() {
  return NextResponse.json(
    { error: { code: "invalid_request", message: "Invalid tag id." } },
    { status: 400 },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!tagIdSchema.safeParse(id).success) return invalidIdResponse();

  const body = await request.json().catch(() => null);
  const result = updateTagSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid tag name.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("tags")
    .update({ name: result.data.name })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return NextResponse.json(
        { error: { code: "duplicate_name", message: "You already have a tag with this name." } },
        { status: 409 },
      );
    }
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This tag doesn't exist." } },
        { status: 404 },
      );
    }
    console.error("[api/tags/:id] update failed:", error);
    return NextResponse.json(
      { error: { code: "update_failed", message: "Something went wrong renaming this tag." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!tagIdSchema.safeParse(id).success) return invalidIdResponse();

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This tag doesn't exist." } },
        { status: 404 },
      );
    }
    console.error("[api/tags/:id] delete failed:", error);
    return NextResponse.json(
      { error: { code: "delete_failed", message: "Something went wrong deleting this tag." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}
