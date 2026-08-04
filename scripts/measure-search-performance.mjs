// Ad-hoc timing harness for the Day 4 performance validation (build-order-complete.md #19):
// times search_knowledge_items() directly (pure server-side query time, what Success_Metrics.md's
// <500ms target is actually about) across a mix of query shapes against the 5,000-item dataset
// seed-search-stress-test.mjs just created. Not committed to the repo.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3] ?? "StressTest123!";

if (!EMAIL) {
  throw new Error("Usage: node measure-search-performance.mjs <email> [password]");
}

async function timeCall(label, fn) {
  const start = performance.now();
  const { data, error } = await fn();
  const ms = performance.now() - start;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  const total = data?.[0]?.total_count ?? data?.length ?? 0;
  console.log(`${label.padEnd(45)} ${ms.toFixed(1).padStart(8)}ms   rows=${data?.length ?? 0} total=${total}`);
  return ms;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  const ownerId = signInData.user.id;
  console.log(`[measure] signed in as ${EMAIL} (${ownerId})\n`);

  const base = {
    p_owner_id: ownerId,
    p_collection_id: null,
    p_type: null,
    p_tag_ids: null,
    p_favorite: null,
    p_archived: null,
    p_created_from: null,
    p_created_to: null,
    p_limit: 20,
    p_offset: 0,
  };

  const timings = [];

  timings.push(
    await timeCall("browse, no query (sort=updated)", () =>
      supabase.rpc("search_knowledge_items", { ...base, p_query: null, p_sort: "updated" }),
    ),
  );
  timings.push(
    await timeCall("full-text query 'project' (relevance)", () =>
      supabase.rpc("search_knowledge_items", { ...base, p_query: "project", p_sort: "relevance" }),
    ),
  );
  timings.push(
    await timeCall("full-text query 'budget review' (relevance)", () =>
      supabase.rpc("search_knowledge_items", { ...base, p_query: "budget review", p_sort: "relevance" }),
    ),
  );
  timings.push(
    await timeCall("query + favorite filter", () =>
      supabase.rpc("search_knowledge_items", {
        ...base,
        p_query: "plan",
        p_sort: "relevance",
        p_favorite: true,
      }),
    ),
  );
  timings.push(
    await timeCall("query + date range filter", () =>
      supabase.rpc("search_knowledge_items", {
        ...base,
        p_query: "meeting",
        p_sort: "relevance",
        p_created_from: "2020-01-01T00:00:00.000Z",
        p_created_to: new Date().toISOString(),
      }),
    ),
  );
  timings.push(
    await timeCall("deep pagination (offset=4000)", () =>
      supabase.rpc("search_knowledge_items", { ...base, p_query: null, p_sort: "updated", p_offset: 4000 }),
    ),
  );
  timings.push(
    await timeCall("title A-Z sort, no query", () =>
      supabase.rpc("search_knowledge_items", { ...base, p_query: null, p_sort: "title" }),
    ),
  );

  const max = Math.max(...timings);
  console.log(`\n[measure] slowest call: ${max.toFixed(1)}ms — ${max < 500 ? "PASS (< 500ms)" : "FAIL (>= 500ms)"}`);
}

main().catch((error) => {
  console.error("[measure] failed:", error);
  process.exitCode = 1;
});
