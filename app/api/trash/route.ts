import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";

// Per docs/03_Architecture/API_Design.md's Trash section: a single listing endpoint for both
// trashed items and trashed collections — restore/permanent-delete reuse the item/collection
// routes that already exist (POST /api/collections/:id/restore, POST /api/items/:id/restore,
// DELETE /api/items/:id/permanent; collections have no permanent-delete route, per
// Collections.md/Knowledge_Items.md — only items get one).
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const [itemsResult, collectionsResult] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("id, collection_id, type, title, is_favorite, is_archived, created_at, updated_at")
      .eq("owner_id", user.id)
      .not("deleted_at", "is", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("collections")
      .select("*")
      .eq("owner_id", user.id)
      .not("deleted_at", "is", null)
      .order("name", { ascending: true }),
  ]);

  if (itemsResult.error || collectionsResult.error) {
    console.error(
      "[api/trash] list failed:",
      itemsResult.error ?? collectionsResult.error,
    );
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading Trash." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: itemsResult.data, collections: collectionsResult.data });
}
