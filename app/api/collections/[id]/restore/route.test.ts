import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(() => builder),
    resolveWith: (value) => {
      resolvedValue = value;
      return builder;
    },
    then: (resolve) => resolve(resolvedValue),
  };
  return builder;
}

let queryBuilder: QueryBuilder;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => queryBuilder,
  }),
}));

import { POST } from "./route";

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/collections/${VALID_ID}/restore`, {
    method: "POST",
  });
}

describe("POST /api/collections/:id/restore", () => {
  beforeEach(() => {
    getUser.mockReset();
    queryBuilder = createQueryBuilder();
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await POST(requestFor(), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection isn't in Trash", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("restores the collection on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: { id: VALID_ID, deleted_at: null }, error: null });

    const response = await POST(requestFor(), { params });

    expect(await response.json()).toEqual({ id: VALID_ID, deleted_at: null });
  });
});
