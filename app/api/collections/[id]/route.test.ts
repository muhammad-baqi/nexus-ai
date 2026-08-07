import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
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

// Isolates logActivity's own insert (already covered by log-activity.test.ts) from this file's
// per-table query-builder mocks, which don't model an `activity_log` table at all.
vi.mock("@/lib/activity/log-activity", () => ({ logActivity: vi.fn() }));

import { DELETE, GET, PATCH } from "./route";

function requestFor(method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/collections/${VALID_ID}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("GET /api/collections/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await GET(requestFor("GET"), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection doesn't exist, isn't owned, or is trashed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(404);
  });

  it("returns the collection on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: { id: VALID_ID, name: "Inbox" }, error: null });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toEqual({ id: VALID_ID, name: "Inbox" });
  });
});

describe("PATCH /api/collections/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await PATCH(requestFor("PATCH", { name: "Inbox" }), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const response = await PATCH(requestFor("PATCH", { name: "" }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a completely empty body", async () => {
    const response = await PATCH(requestFor("PATCH", {}), { params });

    expect(response.status).toBe(400);
  });

  it("returns 409 on a duplicate name", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "23505" } });

    const response = await PATCH(requestFor("PATCH", { name: "Inbox" }), { params });

    expect(response.status).toBe(409);
  });

  it("returns 404 when the row doesn't exist / isn't owned", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(requestFor("PATCH", { is_favorite: true }), { params });

    expect(response.status).toBe(404);
  });

  it("updates and returns the collection on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({
      data: { id: VALID_ID, name: "Inbox", is_favorite: true },
      error: null,
    });

    const response = await PATCH(requestFor("PATCH", { is_favorite: true }), { params });

    expect(await response.json()).toEqual({ id: VALID_ID, name: "Inbox", is_favorite: true });
  });
});

describe("DELETE /api/collections/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await DELETE(requestFor("DELETE"), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection is already gone", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(404);
  });

  it("soft-deletes the collection and cascades to its knowledge_items, scoped to the owner", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({
      data: { id: VALID_ID, deleted_at: "2026-07-30T00:00:00.000Z" },
      error: null,
    });
    getBuilder("knowledge_items").resolveWith({ data: null, error: null });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: VALID_ID, deleted_at: "2026-07-30T00:00:00.000Z" });
    expect(getBuilder("knowledge_items").update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(getBuilder("knowledge_items").eq).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("still returns 200 but flags itemCascadeIncomplete if the item cascade fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({
      data: { id: VALID_ID, deleted_at: "2026-07-30T00:00:00.000Z" },
      error: null,
    });
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.itemCascadeIncomplete).toBe(true);
  });
});
