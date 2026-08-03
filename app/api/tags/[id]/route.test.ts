import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

function createQueryBuilder(): QueryBuilder {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: QueryBuilder = {
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
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

import { DELETE, PATCH } from "./route";

function requestFor(method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/tags/${VALID_ID}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("PATCH /api/tags/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await PATCH(requestFor("PATCH", { name: "js" }), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid name", async () => {
    const response = await PATCH(requestFor("PATCH", { name: "" }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(requestFor("PATCH", { name: "js" }), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the tag doesn't exist / isn't owned", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await PATCH(requestFor("PATCH", { name: "js" }), { params });

    expect(response.status).toBe(404);
  });

  it("returns 409 on a case-insensitive duplicate name", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: null, error: { code: "23505" } });

    const response = await PATCH(requestFor("PATCH", { name: "JavaScript" }), { params });

    expect(response.status).toBe(409);
  });

  it("renames and returns the tag on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({
      data: { id: VALID_ID, name: "javascript" },
      error: null,
    });

    const response = await PATCH(requestFor("PATCH", { name: "javascript" }), { params });

    expect(getBuilder("tags").eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(await response.json()).toEqual({ id: VALID_ID, name: "javascript" });
  });
});

describe("DELETE /api/tags/:id", () => {
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

  it("returns 404 when the tag doesn't exist / isn't owned", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(404);
  });

  it("deletes the tag, scoped to the owner (join rows cascade via the DB, not app code)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("tags").resolveWith({ data: { id: VALID_ID, name: "javascript" }, error: null });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(getBuilder("tags").delete).toHaveBeenCalled();
    expect(getBuilder("tags").eq).toHaveBeenCalledWith("owner_id", "user-1");
    expect(await response.json()).toEqual({ id: VALID_ID, name: "javascript" });
  });
});
