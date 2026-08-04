import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: [], error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    resolveWith: (value) => {
      resolvedValue = value;
      return builder;
    },
    then: (resolve) => resolve(resolvedValue),
  };
  return builder;
}

let builder: QueryBuilder;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => builder,
  }),
}));

import { GET, POST } from "./route";

function postRequestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/recent-searches", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/recent-searches", () => {
  beforeEach(() => {
    getUser.mockReset();
    builder = createQueryBuilder();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns just the query strings, most recent first", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({
      data: [
        { query: "second search", created_at: "2026-01-02" },
        { query: "first search", created_at: "2026-01-01" },
      ],
      error: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({ searches: ["second search", "first search"] });
  });

  it("returns 500 on a query failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: null, error: { message: "boom" } });

    const response = await GET();

    expect(response.status).toBe(500);
  });
});

describe("POST /api/recent-searches", () => {
  beforeEach(() => {
    getUser.mockReset();
    builder = createQueryBuilder();
  });

  it("returns 400 for an empty query", async () => {
    const response = await POST(postRequestWith({ query: "  " }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(postRequestWith({ query: "zephyrus" }));

    expect(response.status).toBe(401);
  });

  it("deduplicates case-insensitively before inserting (re-running a search bumps it, no duplicate)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: [], error: null });

    await POST(postRequestWith({ query: "Zephyrus" }));

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.ilike).toHaveBeenCalledWith("query", "Zephyrus");
    expect(builder.insert).toHaveBeenCalledWith({ owner_id: "user-1", query: "Zephyrus" });
  });

  it("escapes ilike wildcards in the query before dedup matching (regression: '%'/'_' must match literally, not as a pattern)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: [], error: null });

    await POST(postRequestWith({ query: "50% off_deal" }));

    expect(builder.ilike).toHaveBeenCalledWith("query", "50\\% off\\_deal");
    expect(builder.insert).toHaveBeenCalledWith({ owner_id: "user-1", query: "50% off_deal" });
  });

  it("returns 201 with the recorded query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: [], error: null });

    const response = await POST(postRequestWith({ query: "zephyrus" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ query: "zephyrus" });
  });

  it("trims anything beyond the cap after inserting", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: [{ id: "oldest", created_at: "2026-01-01" }], error: null });

    await POST(postRequestWith({ query: "zephyrus" }));

    expect(builder.range).toHaveBeenCalledWith(8, 8);
    expect(builder.lte).toHaveBeenCalledWith("created_at", "2026-01-01");
  });

  it("returns 500 when the dedupe delete fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    builder.resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(postRequestWith({ query: "zephyrus" }));

    expect(response.status).toBe(500);
    expect(builder.insert).not.toHaveBeenCalled();
  });
});
