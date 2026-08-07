import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();

type ResolvedValue = { data: unknown; error: unknown; count?: number };

let tableQueues: Record<string, ResolvedValue[]>;
let rpcResults: Record<string, ResolvedValue>;

function nextTableResult(table: string): ResolvedValue {
  const queue = tableQueues[table];
  if (!queue || queue.length === 0) return { data: null, error: null };
  return queue.length > 1 ? queue.shift()! : queue[0];
}

function createQueryBuilder(resolved: ResolvedValue) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit", "not", "gte"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: ResolvedValue) => void) => resolve(resolved);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => createQueryBuilder(nextTableResult(table)),
    rpc: (name: string, args: unknown) => {
      rpc(name, args);
      return Promise.resolve(rpcResults[name] ?? { data: [], error: null });
    },
  }),
}));

import { GET } from "./route";

function requestFor() {
  return new NextRequest("http://localhost:3000/api/dashboard");
}

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    tableQueues = {};
    rpcResults = {};
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor());

    expect(response.status).toBe(401);
  });

  it("returns all six sections for an account with data", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    rpcResults.search_knowledge_items = {
      data: [{ id: "item-1", collection_id: "col-1", type: "note", title: "Trip", is_favorite: false, is_archived: false, created_at: "t", updated_at: "t", total_count: 1 }],
      error: null,
    };
    rpcResults.dashboard_recently_viewed = {
      data: [{ id: "item-2", collection_id: "col-1", type: "note", title: "Recipe", is_favorite: false, is_archived: false, created_at: "t", updated_at: "t", viewed_at: "t" }],
      error: null,
    };
    rpcResults.dashboard_recent_collections = {
      data: [{ id: "col-1", name: "Inbox", color: null, icon: null, is_favorite: false, last_activity_at: "t" }],
      error: null,
    };
    rpcResults.dashboard_item_type_counts = { data: [{ item_type: "note", item_count: 5 }], error: null };

    tableQueues.collections = [
      { data: [{ id: "col-2", name: "Favorites Collection", color: null, icon: null }], error: null },
      { data: null, error: null, count: 3 },
    ];
    tableQueues.knowledge_items = [
      { data: [{ id: "item-3", collection_id: "col-1", type: "note", title: "Favorited note", updated_at: "t" }], error: null },
    ];
    tableQueues.reminders = [
      {
        data: [{ id: "rem-1", type: "daily", next_fire_at: "t", knowledge_items: { id: "item-4", title: "Follow up", type: "note" } }],
        error: null,
      },
    ];

    const response = await GET(requestFor());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recentItems).toEqual({ data: [expect.objectContaining({ id: "item-1" })], error: null });
    expect(body.recentlyViewed).toEqual({ data: expect.arrayContaining([expect.objectContaining({ id: "item-2" })]), error: null });
    expect(body.favorites).toEqual({
      data: {
        collections: [{ id: "col-2", name: "Favorites Collection", color: null, icon: null }],
        items: [{ id: "item-3", collection_id: "col-1", type: "note", title: "Favorited note", updated_at: "t" }],
      },
      error: null,
    });
    expect(body.recentCollections).toEqual({ data: expect.arrayContaining([expect.objectContaining({ id: "col-1" })]), error: null });
    expect(body.statistics).toEqual({
      data: { totalItems: 5, totalCollections: 3, byType: [{ type: "note", count: 5 }] },
      error: null,
    });
    expect(body.upcomingReminders).toEqual({
      data: [{ id: "rem-1", type: "daily", next_fire_at: "t", knowledge_items: { id: "item-4", title: "Follow up", type: "note" } }],
      error: null,
    });
  });

  it("upcoming reminders section defaults to empty when there are none", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcResults.search_knowledge_items = { data: [], error: null };
    rpcResults.dashboard_recently_viewed = { data: [], error: null };
    rpcResults.dashboard_recent_collections = { data: [], error: null };
    rpcResults.dashboard_item_type_counts = { data: [], error: null };
    tableQueues.collections = [{ data: [], error: null }, { data: null, error: null, count: 0 }];
    tableQueues.knowledge_items = [{ data: [], error: null }];
    tableQueues.reminders = [{ data: [], error: null }];

    const response = await GET(requestFor());
    const body = await response.json();

    expect(body.upcomingReminders).toEqual({ data: [], error: null });
  });

  it("isolates a single section's failure without failing the whole response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    rpcResults.search_knowledge_items = { data: null, error: { message: "boom" } };
    rpcResults.dashboard_recently_viewed = { data: [], error: null };
    rpcResults.dashboard_recent_collections = { data: [], error: null };
    rpcResults.dashboard_item_type_counts = { data: [], error: null };
    tableQueues.collections = [{ data: [], error: null }, { data: null, error: null, count: 0 }];
    tableQueues.knowledge_items = [{ data: [], error: null }];

    const response = await GET(requestFor());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recentItems).toEqual({ data: null, error: "recent_items_failed" });
    expect(body.recentlyViewed).toEqual({ data: [], error: null });
    expect(body.statistics).toEqual({ data: { totalItems: 0, totalCollections: 0, byType: [] }, error: null });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("passes p_sort=updated with no query/filters for recent items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcResults.search_knowledge_items = { data: [], error: null };
    rpcResults.dashboard_recently_viewed = { data: [], error: null };
    rpcResults.dashboard_recent_collections = { data: [], error: null };
    rpcResults.dashboard_item_type_counts = { data: [], error: null };
    tableQueues.collections = [{ data: [], error: null }, { data: null, error: null, count: 0 }];
    tableQueues.knowledge_items = [{ data: [], error: null }];

    await GET(requestFor());

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_owner_id: "user-1", p_query: null, p_sort: "updated" }),
    );
  });
});
