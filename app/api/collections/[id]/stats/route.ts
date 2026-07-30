import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { collectionIdSchema } from "@/lib/validation/collections";

const NO_ROWS_CODE = "PGRST116";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
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

  // Confirms ownership (and that the collection exists / isn't trashed) before counting.
  const { error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .single();

  if (collectionError) {
    if (collectionError.code === NO_ROWS_CODE) {
      return NextResponse.json(
        { error: { code: "not_found", message: "This collection was already removed." } },
        { status: 404 },
      );
    }
    console.error("[api/collections/:id/stats] collection lookup failed:", collectionError);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading statistics." } },
      { status: 500 },
    );
  }

  // docs/01_MVP/Collections.md: statistics are computed on read, not a stored counter.
  const { data: items, error } = await supabase
    .from("knowledge_items")
    .select("type, updated_at")
    .eq("collection_id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("[api/collections/:id/stats] item aggregation failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading statistics." } },
      { status: 500 },
    );
  }

  const byType: Record<string, number> = {};
  let lastUpdated: string | null = null;
  for (const item of items ?? []) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (!lastUpdated || item.updated_at > lastUpdated) lastUpdated = item.updated_at;
  }

  return NextResponse.json({
    total: items?.length ?? 0,
    by_type: byType,
    last_updated: lastUpdated,
  });
}

