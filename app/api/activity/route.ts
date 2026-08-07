import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// A simple per-account timeline (build-order-complete.md #27) — most-recent-first, paginated the
// same way GET /api/items is (page/limit). Embeds the target item/collection's current
// title/name for a human-readable row; a target that's since been permanently deleted just shows
// the action with no label (activity_log's FKs are `on delete set null`, per
// Database_Schema.md — the row itself always survives).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT));

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error, count } = await supabase
    .from("activity_log")
    .select("id, action, knowledge_item_id, collection_id, created_at, knowledge_items(id, title), collections(id, name)", {
      count: "exact",
    })
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (error) {
    console.error("[api/activity] fetch failed:", error);
    return NextResponse.json(
      { error: { code: "fetch_failed", message: "Something went wrong loading activity." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ activity: data ?? [], total: count ?? 0, page, limit });
}
