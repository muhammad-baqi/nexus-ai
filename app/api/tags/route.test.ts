import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
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

describe("GET /api/tags", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns only the caller's tags, sorted by name", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({
      data: [
        { id: "tag-1", name: "javascript" },
        { id: "tag-2", name: "research" },
      ],
      error: null,
    });

    const response = await GET();

    expect(getBuilder("tags").eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(await response.json()).toEqual({
      tags: [
        { id: "tag-1", name: "javascript" },
        { id: "tag-2", name: "research" },
      ],
    });
  });

  it("returns an empty array when the caller has no tags", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: [], error: null });

    const response = await GET();

    expect(await response.json()).toEqual({ tags: [] });
  });

  it("returns 500 and logs on a query failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: null, error: { message: "boom" } });

    const response = await GET();

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
