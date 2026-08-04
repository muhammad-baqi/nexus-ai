import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const VALID_COLLECTION_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_TAG_ID = "223e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => builder),
    resolveWith: (value) => {
      resolvedValue = value;
      return builder;
    },
    then: (resolve) => resolve(resolvedValue),
  };
  return builder;
}

let builders: Record<string, QueryBuilder>;
function getBuilder(table: string) {
  if (!builders[table]) builders[table] = createQueryBuilder();
  return builders[table];
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => getBuilder(table),
    rpc,
  }),
}));

import { GET, POST } from "./route";

function requestFor(query = "") {
  return new NextRequest(`http://localhost:3000/api/items${query}`);
}

function postRequestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// The collection-ownership check every POST performs before inserting.
function allowCollectionOwnership() {
  getBuilder("collections").resolveWith({ data: { id: VALID_COLLECTION_ID }, error: null });
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    collection_id: VALID_COLLECTION_ID,
    type: "note",
    title: "Trip planning",
    is_favorite: false,
    is_archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    total_count: 1,
    ...overrides,
  };
}

describe("GET /api/items", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    builders = {};
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor());

    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed collection_id filter", async () => {
    const response = await GET(requestFor("?collection_id=not-a-uuid"));

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid boolean filter value", async () => {
    const response = await GET(requestFor("?favorite=maybe"));

    expect(response.status).toBe(400);
  });

  it("scopes the search to the caller's own items via p_owner_id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor());

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_owner_id: "user-1" }),
    );
  });

  it("passes q, sort defaulting to relevance, and the collection_id filter through", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor(`?q=zephyrus&collection_id=${VALID_COLLECTION_ID}`));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({
        p_query: "zephyrus",
        p_collection_id: VALID_COLLECTION_ID,
        p_sort: "relevance",
      }),
    );
  });

  it("defaults sort to updated when there is no query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor());

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_query: null, p_sort: "updated" }),
    );
  });

  it("respects an explicit sort override even with a query present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?q=zephyrus&sort=title"));

    expect(rpc).toHaveBeenCalledWith("search_knowledge_items", expect.objectContaining({ p_sort: "title" }));
  });

  it("collects repeated tag params into p_tag_ids (OR filter)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor(`?tag=${VALID_TAG_ID}&tag=${VALID_COLLECTION_ID}`));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_tag_ids: [VALID_TAG_ID, VALID_COLLECTION_ID] }),
    );
  });

  it("maps favorite=false to p_favorite: false, not undefined (the JS Boolean() coercion trap)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?favorite=false"));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_favorite: false }),
    );
  });

  it("extends created_to to the end of the selected day, not midnight (regression: a date-only value must include everything created that day)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?created_from=2026-08-01&created_to=2026-08-01"));

    const call = rpc.mock.calls[0][1] as { p_created_from: string; p_created_to: string };
    expect(call.p_created_from).toBe("2026-08-01T00:00:00.000Z");
    // An item created at 23:00 UTC on the selected end date must be <= this bound.
    expect(new Date("2026-08-01T23:00:00.000Z").getTime()).toBeLessThanOrEqual(
      new Date(call.p_created_to).getTime(),
    );
    expect(call.p_created_to.startsWith("2026-08-01")).toBe(true);
  });

  it("defaults page/limit and computes the offset for page 2", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?page=2&limit=5"));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_limit: 5, p_offset: 5 }),
    );
  });

  it("returns items with total/page/limit, stripping total_count off each row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [row({ total_count: 3 }), row({ id: "item-2", total_count: 3 })], error: null });

    const response = await GET(requestFor());
    const body = await response.json();

    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).not.toHaveProperty("total_count");
  });

  it("returns total: 0 for an empty result set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await GET(requestFor());
    const body = await response.json();

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns 500 on a query failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
  });
});

describe("POST /api/items", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 when collection_id is missing, without touching the database", async () => {
    const response = await POST(postRequestWith({ title: "Trip" }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(postRequestWith({ collection_id: VALID_COLLECTION_ID }));

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection doesn't belong to the caller (or is trashed)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await POST(postRequestWith({ collection_id: VALID_COLLECTION_ID }));

    expect(response.status).toBe(404);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("defaults the title to 'Untitled Note' when omitted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", title: "Untitled Note" },
      error: null,
    });

    await POST(postRequestWith({ collection_id: VALID_COLLECTION_ID }));

    expect(getBuilder("knowledge_items").insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Untitled Note" }),
    );
  });

  it("always inserts type: 'note' regardless of the payload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({ data: { id: "item-1" }, error: null });

    await POST(
      postRequestWith({ collection_id: VALID_COLLECTION_ID, type: "website" } as unknown as object),
    );

    expect(getBuilder("knowledge_items").insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "note" }),
    );
  });

  it("creates a note and returns it with 201", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", title: "Trip planning", description: "Packing list" },
      error: null,
    });

    const response = await POST(
      postRequestWith({
        collection_id: VALID_COLLECTION_ID,
        title: "Trip planning",
        description: "Packing list",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "item-1",
      title: "Trip planning",
      description: "Packing list",
    });
  });

  it("returns 500 and logs on an insert failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(postRequestWith({ collection_id: VALID_COLLECTION_ID }));

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
