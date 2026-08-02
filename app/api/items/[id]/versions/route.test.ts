import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    const queue = queues[table];
    resolve(queue && queue.length > 0 ? queue.shift()! : { data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => createQueryBuilder(table),
  }),
}));

import { GET } from "./route";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/versions`);
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("GET /api/items/:id/versions", () => {
  beforeEach(() => {
    getUser.mockReset();
    queues = {};
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 400 for a malformed item id without touching the database", async () => {
    const response = await GET(requestFor(), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item doesn't exist or belongs to another user", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await GET(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("returns versions ordered newest-first, id + created_at only (no content)", async () => {
    queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
    queueResponse("note_versions", {
      data: [
        { id: "v2", created_at: "2026-08-02T00:00:00.000Z" },
        { id: "v1", created_at: "2026-08-01T00:00:00.000Z" },
      ],
      error: null,
    });

    const response = await GET(requestFor(), { params });

    expect(await response.json()).toEqual([
      { id: "v2", created_at: "2026-08-02T00:00:00.000Z" },
      { id: "v1", created_at: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("returns 500 and logs on a query failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
    queueResponse("note_versions", { data: null, error: { message: "boom" } });

    const response = await GET(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
