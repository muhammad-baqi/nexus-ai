import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

// Per-table FIFO queue: the route makes several distinct calls (trashed-at lookup, the restore
// update, the item cascade update), each needing its own queued response.
let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "update", "eq", "not"];
  for (const method of chainable) {
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
    queues = {};
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
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
    queueResponse("collections", { data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("returns 500 and logs when the trashed-at lookup fails for a non-404 reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("collections", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("restores the collection and cascades restore to the items trashed with it", async () => {
    const deletedAt = "2026-01-01T00:00:00.000Z";
    queueResponse("collections", { data: { deleted_at: deletedAt }, error: null }); // lookup
    queueResponse("collections", { data: { id: VALID_ID, deleted_at: null }, error: null }); // update
    queueResponse("knowledge_items", { data: null, error: null }); // cascade update succeeds

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: VALID_ID, deleted_at: null });
  });

  it("still returns 200 but flags itemCascadeIncomplete if the item cascade fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deletedAt = "2026-01-01T00:00:00.000Z";
    queueResponse("collections", { data: { deleted_at: deletedAt }, error: null });
    queueResponse("collections", { data: { id: VALID_ID, deleted_at: null }, error: null });
    queueResponse("knowledge_items", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ itemCascadeIncomplete: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and logs when the restore update itself fails for a non-404 reason", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const deletedAt = "2026-01-01T00:00:00.000Z";
    queueResponse("collections", { data: { deleted_at: deletedAt }, error: null });
    queueResponse("collections", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
