import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  createCollectionSchema,
  DEFAULT_COLLECTION_COLOR,
  DEFAULT_COLLECTION_ICON,
  listCollectionsQuerySchema,
} from "@/lib/validation/collections";

// Postgres's unique_violation code — fires on the (owner_id, lower(name)) unique index from
// supabase/migrations/001_initial_schema.sql.
const UNIQUE_VIOLATION_CODE = "23505";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = listCollectionsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    view: searchParams.get("view") ?? undefined,
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

  let query = supabase.from("collections").select("*").eq("owner_id", user.id);

  // A trashed collection is excluded from both the active and archived views regardless of its
  // own is_archived flag — restorable only from this dedicated view (docs/01_MVP/Collections.md).
  if (result.data.view === "trashed") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null).eq("is_archived", result.data.view === "archived");
  }

  query = query.order("is_favorite", { ascending: false }).order("name", { ascending: true });

  // Not currently called by CollectionsView (which filters name matches client-side per
  // Collections.md's small-N guidance) — kept for API_Design.md's documented shape / future
  // server-side callers, e.g. once Search needs it.
  if (result.data.q) {
    query = query.ilike("name", `%${result.data.q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[api/collections] list failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading collections." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ collections: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = createCollectionSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid collection.",
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
    .insert({
      owner_id: user.id,
      name: result.data.name,
      description: result.data.description ?? null,
      color: result.data.color ?? DEFAULT_COLLECTION_COLOR,
      icon: result.data.icon ?? DEFAULT_COLLECTION_ICON,
    })
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
    console.error("[api/collections] create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong creating the collection." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
