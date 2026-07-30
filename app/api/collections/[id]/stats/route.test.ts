import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
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

import { GET } from "./route";

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/collections/${VALID_ID}/stats`);
}

describe("GET /api/collections/:id/stats", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await GET(requestFor(), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection doesn't exist or isn't owned", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await GET(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("returns zeroed stats for a collection with no items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: { id: VALID_ID }, error: null });
    getBuilder("knowledge_items").resolveWith({ data: [], error: null });

    const response = await GET(requestFor(), { params });

    expect(await response.json()).toEqual({ total: 0, by_type: {}, last_updated: null });
    expect(getBuilder("knowledge_items").eq).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("aggregates counts by type and finds the most recent updated_at", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: { id: VALID_ID }, error: null });
    getBuilder("knowledge_items").resolveWith({
      data: [
        { type: "note", updated_at: "2026-07-28T00:00:00.000Z" },
        { type: "note", updated_at: "2026-07-30T00:00:00.000Z" },
        { type: "website", updated_at: "2026-07-29T00:00:00.000Z" },
      ],
      error: null,
    });

    const response = await GET(requestFor(), { params });

    expect(await response.json()).toEqual({
      total: 3,
      by_type: { note: 2, website: 1 },
      last_updated: "2026-07-30T00:00:00.000Z",
    });
  });
});
