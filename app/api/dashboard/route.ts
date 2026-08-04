import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const RECENT_ITEMS_LIMIT = 15;
const RECENTLY_VIEWED_LIMIT = 10;
const FAVORITE_ITEMS_LIMIT = 10;
const FAVORITE_COLLECTIONS_LIMIT = 20;
const RECENT_COLLECTIONS_LIMIT = 6;

type SectionResult<T> = { data: T; error: null } | { data: null; error: string };

function ok<T>(data: T): SectionResult<T> {
  return { data, error: null };
}

function failed<T>(section: string, error: unknown): SectionResult<T> {
  console.error(`[api/dashboard] ${section} failed:`, error);
  return { data: null, error: `${section}_failed` };
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
};

// Recent Items (Dashboard.md): most recently created-or-edited items across all Collections.
// Reuses search_knowledge_items() (005_search_function.sql) with no query/filters and
// p_sort="updated" — the same RPC GET /api/items falls back to when browsing without a search
// term, so this stays consistent with how "recently updated" is defined everywhere else.
async function loadRecentItems(supabase: SupabaseClient, ownerId: string) {
  try {
    const { data, error } = await supabase.rpc("search_knowledge_items", {
      p_owner_id: ownerId,
      p_query: null,
      p_collection_id: null,
      p_type: null,
      p_tag_ids: null,
      p_favorite: null,
      p_archived: null,
      p_created_from: null,
      p_created_to: null,
      p_sort: "updated",
      p_limit: RECENT_ITEMS_LIMIT,
      p_offset: 0,
    });
    if (error) throw error;
    const rows = (data ?? []) as (SearchRow & { total_count: number })[];
    return ok(
      rows.map((row) => ({
        id: row.id,
        collection_id: row.collection_id,
        type: row.type,
        title: row.title,
        is_favorite: row.is_favorite,
        is_archived: row.is_archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
  } catch (error) {
    return failed("recent_items", error);
  }
}

// Recently Viewed (Dashboard.md): distinct from edited — tracks opening an item, backed by the
// new item_views table (006_dashboard.sql).
async function loadRecentlyViewed(supabase: SupabaseClient, ownerId: string) {
  try {
    const { data, error } = await supabase.rpc("dashboard_recently_viewed", {
      p_owner_id: ownerId,
      p_limit: RECENTLY_VIEWED_LIMIT,
    });
    if (error) throw error;
    return ok(data ?? []);
  } catch (error) {
    return failed("recently_viewed", error);
  }
}

// Favorites (Dashboard.md): a combined section — favorited Collections and favorited Knowledge
// Items, so both surface in one glance regardless of which kind of thing was favorited.
async function loadFavorites(supabase: SupabaseClient, ownerId: string) {
  try {
    const [collectionsResult, itemsResult] = await Promise.all([
      supabase
        .from("collections")
        .select("id, name, color, icon")
        .eq("owner_id", ownerId)
        .eq("is_favorite", true)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .limit(FAVORITE_COLLECTIONS_LIMIT),
      supabase
        .from("knowledge_items")
        .select("id, collection_id, type, title, updated_at")
        .eq("owner_id", ownerId)
        .eq("is_favorite", true)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(FAVORITE_ITEMS_LIMIT),
    ]);
    if (collectionsResult.error) throw collectionsResult.error;
    if (itemsResult.error) throw itemsResult.error;
    return ok({ collections: collectionsResult.data ?? [], items: itemsResult.data ?? [] });
  } catch (error) {
    return failed("favorites", error);
  }
}

// Recent Collections (Dashboard.md): ordered by most recent activity, not alphabetically —
// dashboard_recent_collections() (006_dashboard.sql) does the "latest of the collection's own
// updated_at and its items' updated_at" aggregation a plain PostgREST query can't express.
async function loadRecentCollections(supabase: SupabaseClient, ownerId: string) {
  try {
    const { data, error } = await supabase.rpc("dashboard_recent_collections", {
      p_owner_id: ownerId,
      p_limit: RECENT_COLLECTIONS_LIMIT,
    });
    if (error) throw error;
    return ok(data ?? []);
  } catch (error) {
    return failed("recent_collections", error);
  }
}

// Statistics (Dashboard.md): total items, item count by type, total Collections. No charts —
// numeric summary only, per the Out of Scope note.
async function loadStatistics(supabase: SupabaseClient, ownerId: string) {
  try {
    const [typeCountsResult, collectionsCountResult] = await Promise.all([
      supabase.rpc("dashboard_item_type_counts", { p_owner_id: ownerId }),
      supabase
        .from("collections")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .is("deleted_at", null),
    ]);
    if (typeCountsResult.error) throw typeCountsResult.error;
    if (collectionsCountResult.error) throw collectionsCountResult.error;

    const byType = (typeCountsResult.data ?? []) as { item_type: string; item_count: number }[];
    const totalItems = byType.reduce((sum, row) => sum + Number(row.item_count), 0);

    return ok({
      totalItems,
      totalCollections: collectionsCountResult.count ?? 0,
      byType: byType.map((row) => ({ type: row.item_type, count: Number(row.item_count) })),
    });
  } catch (error) {
    return failed("statistics", error);
  }
}

// Upcoming Reminders (Dashboard.md): per build-order-complete.md step 18, this section
// deliberately just renders its empty state for now — Reminders/Notifications is a Day 6
// feature (there's no way to create a reminder yet), and CLAUDE.md's build-discipline rule
// ("never build ahead of the current day") applies even though the `reminders` table itself
// already exists from Day 1's schema. Wiring up the real query now would mean shipping
// untestable, unreachable code — Day 6 gets both the query and its test coverage together.
function loadUpcomingReminders() {
  return ok([] as never[]);
}

// Aggregated Dashboard endpoint (API_Design.md) — every section runs in parallel and is
// independently try/catch'd (each loader above never throws), per Dashboard.md's Performance and
// Error States sections: one section failing (e.g. a timeout) must not block the rest of the page
// from rendering.
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const [recentItems, recentlyViewed, favorites, recentCollections, statistics, upcomingReminders] =
    await Promise.all([
      loadRecentItems(supabase, user.id),
      loadRecentlyViewed(supabase, user.id),
      loadFavorites(supabase, user.id),
      loadRecentCollections(supabase, user.id),
      loadStatistics(supabase, user.id),
      Promise.resolve(loadUpcomingReminders()),
    ]);

  return NextResponse.json({
    recentItems,
    recentlyViewed,
    favorites,
    recentCollections,
    statistics,
    upcomingReminders,
  });
}
