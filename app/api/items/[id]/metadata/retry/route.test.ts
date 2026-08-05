import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

// vi.hoisted: referenced inside the vi.mock() factories below, which are hoisted above regular
// top-level const declarations.
const { after, fetchBookmarkMetadata } = vi.hoisted(() => ({
  fetchBookmarkMetadata: vi.fn(),
  after: vi.fn((callback: () => void) => callback()),
}));

type ResolvedValue = { data: unknown; error: unknown };

// Same per-table FIFO queue pattern as app/api/items/[id]/restore/route.test.ts — this route
// makes two distinct Supabase calls per request (the item lookup, then the metadata status
// reset), each needing its own queued response.
let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "update", "eq", "is"];
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

vi.mock("@/lib/bookmarks/fetch-bookmark-metadata", () => ({ fetchBookmarkMetadata }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

import { POST } from "./route";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/metadata/retry`, {
    method: "POST",
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("POST /api/items/:id/metadata/retry", () => {
  beforeEach(() => {
    getUser.mockReset();
    queues = {};
    fetchBookmarkMetadata.mockReset();
    after.mockClear();
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

  it("returns 404 for an item that doesn't belong to the caller or doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("returns 400 for an item that isn't type 'website'", async () => {
    queueResponse("knowledge_items", { data: { id: VALID_ID, type: "note" }, error: null });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(400);
    expect(after).not.toHaveBeenCalled();
  });

  it("resets fetch_status to pending and re-enqueues the metadata job via after()", async () => {
    queueResponse("knowledge_items", { data: { id: VALID_ID, type: "website" }, error: null });
    queueResponse("website_metadata", {
      data: {
        url: "https://example.com",
        canonical_url: null,
        domain: null,
        og_image_url: null,
        favicon_url: null,
        fetch_status: "pending",
      },
      error: null,
    });

    const response = await POST(requestFor(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.website_metadata.fetch_status).toBe("pending");
    expect(after).toHaveBeenCalledWith(expect.any(Function));
    expect(fetchBookmarkMetadata).toHaveBeenCalledWith(
      expect.anything(),
      VALID_ID,
      "https://example.com",
    );
  });

  it("returns 500 and logs when the status reset fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", { data: { id: VALID_ID, type: "website" }, error: null });
    queueResponse("website_metadata", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
