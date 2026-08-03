import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";
const ORIGINAL_COLLECTION_ID = "33333333-3333-3333-a333-333333333333";
const INBOX_ID = "44444444-4444-4444-a444-444444444444";

type ResolvedValue = { data: unknown; error: unknown };

// Same per-table FIFO queue pattern as app/api/items/[id]/route.test.ts — this route makes
// several distinct Supabase calls per request (prior-state lookup, verifyCollectionOwnership's
// check, an optional Inbox lookup, the final update), each needing its own queued response.
let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "update", "eq", "is", "not", "order", "limit"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => builder);
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

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/restore`, {
    method: "POST",
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("POST /api/items/:id/restore", () => {
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

  it("returns 404 when the item isn't currently trashed, isn't owned, or doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("This item isn't in Trash.");
  });

  it("restores in place when the original collection is still live, reporting rehomed: false", async () => {
    queueResponse("knowledge_items", {
      data: { collection_id: ORIGINAL_COLLECTION_ID },
      error: null,
    });
    // verifyCollectionOwnership's check: the original collection is found (still live).
    queueResponse("collections", { data: { id: ORIGINAL_COLLECTION_ID }, error: null });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, collection_id: ORIGINAL_COLLECTION_ID, deleted_at: null },
      error: null,
    });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      collection_id: ORIGINAL_COLLECTION_ID,
      rehomed: false,
    });
  });

  it("re-homes into the caller's Inbox and reports rehomed: true when the original collection is trashed/gone", async () => {
    queueResponse("knowledge_items", {
      data: { collection_id: ORIGINAL_COLLECTION_ID },
      error: null,
    });
    // verifyCollectionOwnership's check: the original collection is NOT found (trashed/gone).
    queueResponse("collections", { data: null, error: { code: "PGRST116" } });
    // Inbox lookup succeeds.
    queueResponse("collections", { data: { id: INBOX_ID, name: "Inbox" }, error: null });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, collection_id: INBOX_ID, deleted_at: null },
      error: null,
    });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      collection_id: INBOX_ID,
      rehomed: true,
      rehomedToCollectionName: "Inbox",
    });
  });

  it("falls back to the caller's oldest surviving collection when Inbox was renamed/can't be found by name, reporting rehomed: true and the real target name", async () => {
    const OLDEST_ID = "55555555-5555-5555-a555-555555555555";
    queueResponse("knowledge_items", {
      data: { collection_id: ORIGINAL_COLLECTION_ID },
      error: null,
    });
    // verifyCollectionOwnership's check: the original collection is NOT found (trashed/gone).
    queueResponse("collections", { data: null, error: { code: "PGRST116" } });
    queueResponse("collections", { data: null, error: null }); // maybeSingle: no row named "Inbox"
    queueResponse("collections", { data: { id: OLDEST_ID, name: "Work Notes" }, error: null }); // oldest live collection
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, collection_id: OLDEST_ID, deleted_at: null },
      error: null,
    });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      collection_id: OLDEST_ID,
      rehomed: true,
      rehomedToCollectionName: "Work Notes",
    });
  });

  it("returns 500 when re-homing is needed but neither Inbox nor any other live collection can be found", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", {
      data: { collection_id: ORIGINAL_COLLECTION_ID },
      error: null,
    });
    queueResponse("collections", { data: null, error: { code: "PGRST116" } });
    queueResponse("collections", { data: null, error: null }); // maybeSingle: no Inbox row
    queueResponse("collections", { data: null, error: null }); // maybeSingle: no fallback row either

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and logs on a restore failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", {
      data: { collection_id: ORIGINAL_COLLECTION_ID },
      error: null,
    });
    queueResponse("collections", { data: { id: ORIGINAL_COLLECTION_ID }, error: null });
    queueResponse("knowledge_items", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
