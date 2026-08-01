import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_COLLECTION_ID = "123e4567-e89b-12d3-a456-426614174000";

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

describe("GET /api/items", () => {
  beforeEach(() => {
    getUser.mockReset();
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

  it("scopes the query to the caller's own items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("knowledge_items").resolveWith({ data: [], error: null });

    await GET(requestFor());

    expect(getBuilder("knowledge_items").eq).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("applies the collection_id filter when provided", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("knowledge_items").resolveWith({ data: [], error: null });

    await GET(requestFor(`?collection_id=${VALID_COLLECTION_ID}`));

    expect(getBuilder("knowledge_items").eq).toHaveBeenCalledWith(
      "collection_id",
      VALID_COLLECTION_ID,
    );
  });

  it("returns 500 on a query failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

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
