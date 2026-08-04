import { NextResponse, type NextRequest } from "next/server";

import { verifyCollectionOwnership } from "@/lib/items/verify-collection-ownership";
import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  createNoteSchema,
  DEFAULT_ITEMS_PAGE_LIMIT,
  DEFAULT_NOTE_TITLE,
  listItemsQuerySchema,
} from "@/lib/validation/items";

// The primary listing/search endpoint (API_Design.md) — also backs Global Search when `q` is
// present, with filters/sort/pagination. Backed by the search_knowledge_items() Postgres
// function (005_search_function.sql): a plain PostgREST query can't express ts_rank ordering,
// and doing the tag OR-filter as a separate round trip would cost an extra query per request —
// this keeps every combination to one indexed query, which is what the <500ms/5,000-item target
// in Search.md actually requires. RLS on knowledge_items still applies underneath the function
// (it isn't `security definer`) — p_owner_id here is a redundant, explicit filter for
// defense-in-depth, matching every other route's pattern (CLAUDE.md rule #1), not the real
// authorization boundary.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const result = listItemsQuerySchema.safeParse({
    collection_id: searchParams.get("collection_id") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    tag: searchParams.getAll("tag").length > 0 ? searchParams.getAll("tag") : undefined,
    favorite: searchParams.get("favorite") ?? undefined,
    archived: searchParams.get("archived") ?? undefined,
    created_from: searchParams.get("created_from") ?? undefined,
    created_to: searchParams.get("created_to") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
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

  const { q, collection_id, type, tag, favorite, archived, created_from, created_to, sort } =
    result.data;
  const page = result.data.page ?? 1;
  const limit = result.data.limit ?? DEFAULT_ITEMS_PAGE_LIMIT;
  // Relevance only means something with a query; default to most-recently-updated when browsing
  // without one, per Search.md's Sorting section.
  const effectiveSort = sort ?? (q ? "relevance" : "updated");

  const { data, error } = await supabase.rpc("search_knowledge_items", {
    p_owner_id: user.id,
    p_query: q ?? null,
    p_collection_id: collection_id ?? null,
    p_type: type ?? null,
    p_tag_ids: tag ?? null,
    p_favorite: favorite ?? null,
    p_archived: archived ?? null,
    // created_to is an inclusive end-of-day bound — an `<input type="date">` value like
    // "2026-08-01" parses to 2026-08-01T00:00:00.000Z, and comparing created_at <= that would
    // exclude nearly everything actually created on the selected end date. Push it to the last
    // millisecond of that day instead. created_from's plain midnight start is correct as-is.
    p_created_from: created_from ? new Date(created_from).toISOString() : null,
    p_created_to: created_to
      ? new Date(new Date(created_to).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      : null,
    p_sort: effectiveSort,
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });

  if (error) {
    console.error("[api/items] search failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading items." } },
      { status: 500 },
    );
  }

  type SearchRow = {
    id: string;
    collection_id: string;
    type: string;
    title: string;
    is_favorite: boolean;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    total_count: number;
  };
  const rows = (data ?? []) as SearchRow[];
  const total = rows[0]?.total_count ?? 0;
  const items = rows.map((row) => ({
    id: row.id,
    collection_id: row.collection_id,
    type: row.type,
    title: row.title,
    is_favorite: row.is_favorite,
    is_archived: row.is_archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ items, total, page, limit });
}

// Only Notes can be created today — a `type` discriminator gets added once Website
// Bookmarks/Files/etc. ship (Day 5), not pre-built now for a type that doesn't exist yet.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = createNoteSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid note.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const ownsCollection = await verifyCollectionOwnership(supabase, result.data.collection_id, user.id);
  if (!ownsCollection) {
    return NextResponse.json(
      { error: { code: "not_found", message: "This collection doesn't exist." } },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("knowledge_items")
    .insert({
      owner_id: user.id,
      collection_id: result.data.collection_id,
      type: "note",
      title: result.data.title || DEFAULT_NOTE_TITLE,
      description: result.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/items] create failed:", error);
    return NextResponse.json(
      { error: { code: "create_failed", message: "Something went wrong creating the note." } },
      { status: 500 },
    );
  }

  return NextResponse.json(data, { status: 201 });
}
