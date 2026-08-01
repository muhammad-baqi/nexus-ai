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

import { GET, PATCH } from "./route";

function requestFor(method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("GET /api/items/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    queryBuilder = createQueryBuilder();
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

  it("returns 404 when the item doesn't exist, isn't owned, or is trashed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(404);
  });

  it("returns the item on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toEqual({
      id: VALID_ID,
      title: "Trip planning",
      description: "Packing list",
    });
  });
});

describe("PATCH /api/items/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    queryBuilder = createQueryBuilder();
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), {
      params: invalidParams,
    });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a completely empty body", async () => {
    const response = await PATCH(requestFor("PATCH", {}), { params });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a whitespace-only title", async () => {
    const response = await PATCH(requestFor("PATCH", { title: "   " }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the row doesn't exist / isn't owned", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(404);
  });

  it("updates and returns the item on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({
      data: { id: VALID_ID, title: "Trip planning", description: "Updated body" },
      error: null,
    });

    const response = await PATCH(
      requestFor("PATCH", { title: "Trip planning", description: "Updated body" }),
      { params },
    );

    expect(await response.json()).toEqual({
      id: VALID_ID,
      title: "Trip planning",
      description: "Updated body",
    });
  });

  it("returns 500 and logs on an update failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryBuilder.resolveWith({ data: null, error: { message: "boom" } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
