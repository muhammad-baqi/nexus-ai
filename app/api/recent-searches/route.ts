import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/supabase/require-user";
import { createClient } from "@/lib/supabase/server";
import { recordRecentSearchSchema } from "@/lib/validation/search";

// "The last several distinct search queries" (Search.md) — shown as suggestions when the
// search bar is focused with no query typed yet.
const RECENT_SEARCHES_LIMIT = 8;

// Escapes ilike's wildcard characters so a query like "50% off" or "file_name" is matched
// literally rather than as a pattern.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function GET() {
  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const { data, error } = await supabase
    .from("recent_searches")
    .select("query, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(RECENT_SEARCHES_LIMIT);

  if (error) {
    console.error("[api/recent-searches] list failed:", error);
    return NextResponse.json(
      { error: { code: "list_failed", message: "Something went wrong loading recent searches." } },
      { status: 500 },
    );
  }

  return NextResponse.json({ searches: data.map((row) => row.query) });
}

// Recording is a distinct action from search-as-you-type — the client calls this once a query
// has "settled" (Enter, or a longer pause than the live-results debounce), not on every
// keystroke-driven fetch, or every partial prefix would get stored.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const result = recordRecentSearchSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: result.error.issues[0]?.message ?? "Invalid search query.",
        },
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { user, response } = await requireUser(supabase);
  if (!user) return response;

  const query = result.data.query;

  // Re-running an existing recent search should bump it to the top rather than create a
  // duplicate entry — delete-then-insert is simpler and just as correct as an upsert here since
  // there's no unique constraint to upsert against (recent_searches has no natural key beyond
  // id), and this stays a "last several distinct queries" list per Search.md. This needs a
  // case-insensitive *exact* match, not a substring one — ilike treats `%`/`_` in the pattern as
  // wildcards, so a query containing either (e.g. "50% off") must have them escaped first or the
  // delete would match/miss unrelated rows.
  const { error: dedupeError } = await supabase
    .from("recent_searches")
    .delete()
    .eq("owner_id", user.id)
    .ilike("query", escapeLikePattern(query));

  if (dedupeError) {
    console.error("[api/recent-searches] dedupe failed:", dedupeError);
    return NextResponse.json(
      { error: { code: "record_failed", message: "Something went wrong recording this search." } },
      { status: 500 },
    );
  }

  const { error: insertError } = await supabase
    .from("recent_searches")
    .insert({ owner_id: user.id, query });

  if (insertError) {
    console.error("[api/recent-searches] insert failed:", insertError);
    return NextResponse.json(
      { error: { code: "record_failed", message: "Something went wrong recording this search." } },
      { status: 500 },
    );
  }

  // Trim to the cap so this list can't grow unbounded — find the id to cut off at, then delete
  // anything older. Two round trips, but this only runs on a settled/committed search, not on
  // every keystroke.
  const { data: overflow, error: overflowError } = await supabase
    .from("recent_searches")
    .select("id, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .range(RECENT_SEARCHES_LIMIT, RECENT_SEARCHES_LIMIT);

  if (overflowError) {
    console.error("[api/recent-searches] overflow lookup failed:", overflowError);
    // Not fatal — the search was already recorded; an over-cap list self-corrects next time
    // GET's own .limit() applies, it just won't be pruned from storage yet.
  } else if (overflow.length > 0) {
    const { error: trimError } = await supabase
      .from("recent_searches")
      .delete()
      .eq("owner_id", user.id)
      .lte("created_at", overflow[0].created_at);

    if (trimError) {
      console.error("[api/recent-searches] trim failed:", trimError);
    }
  }

  return NextResponse.json({ query }, { status: 201 });
}
