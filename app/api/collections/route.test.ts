import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

// A minimal stand-in for supabase-js's chainable, thenable query builder: every method used by
// the route under test returns `this` so calls can chain in any order, and the object resolves
// (via `.then`) to whatever `resolveWith` was last configured to return.
function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
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

let queryBuilder: ReturnType<typeof createQueryBuilder>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => queryBuilder,
  }),
}));

import { GET, POST } from "./route";

function requestFor(query = "") {
  return new NextRequest(`http://localhost:3000/api/collections${query}`);
}

function postRequestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/collections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/collections", () => {
  beforeEach(() => {
    getUser.mockReset();
    queryBuilder = createQueryBuilder();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor());

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid view value", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await GET(requestFor("?view=maybe"));

    expect(response.status).toBe(400);
  });

  it("returns the list of collections on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: [{ id: "col-1", name: "Inbox" }], error: null });

    const response = await GET(requestFor());

    expect(await response.json()).toEqual({ collections: [{ id: "col-1", name: "Inbox" }] });
  });

  it("returns 500 on a query failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: null, error: { message: "boom" } });

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
  });

  it("filters by deleted_at IS NOT NULL for the trashed view, ignoring is_archived", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: [], error: null });

    await GET(requestFor("?view=trashed"));

    expect(queryBuilder.not).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(queryBuilder.eq).not.toHaveBeenCalledWith("is_archived", expect.anything());
  });
});

describe("POST /api/collections", () => {
  beforeEach(() => {
    getUser.mockReset();
    queryBuilder = createQueryBuilder();
  });

  it("returns 400 for an empty name without touching the database", async () => {
    const response = await POST(postRequestWith({ name: "" }));

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(postRequestWith({ name: "Inbox" }));

    expect(response.status).toBe(401);
  });

  it("creates a collection and returns it with 201", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: { id: "col-1", name: "Travel" }, error: null });

    const response = await POST(postRequestWith({ name: "Travel" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "col-1", name: "Travel" });
  });

  it("returns 409 with a friendly message on a duplicate name", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const response = await POST(postRequestWith({ name: "Inbox" }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("duplicate_name");
  });
});
