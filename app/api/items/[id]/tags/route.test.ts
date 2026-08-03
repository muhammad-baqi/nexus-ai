import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

// Per-table FIFO queue: this route makes multiple sequential calls against both
// `knowledge_items` (ownership check) and `tags`/`knowledge_item_tags` (get-or-create, attach,
// then re-fetch the item's tags) — same pattern as app/api/items/[id]/route.test.ts.
let queues: Record<string, ResolvedValue[]>;
let upsertCalls: unknown[][];
let insertCalls: unknown[][];

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq", "is"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.insert = vi.fn((...args: unknown[]) => {
    insertCalls.push(args);
    return builder;
  });
  builder.upsert = vi.fn((...args: unknown[]) => {
    upsertCalls.push(args);
    return builder;
  });
  builder.single = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    const queue = queues[table];
    resolve(queue && queue.length > 0 ? queue.shift()! : { data: null, error: null });
  };
  return builder;
}

let builders: Record<string, ReturnType<typeof createQueryBuilder>>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      builders[table] ??= createQueryBuilder(table);
      return builders[table];
    },
  }),
}));

import { POST } from "./route";

function requestFor(body: unknown) {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/tags`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function allowItemOwnership() {
  queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
}

function queueFinalTags(tags: { id: string; name: string }[]) {
  queueResponse(
    "knowledge_item_tags",
    { data: tags.map((tag) => ({ tags: tag })), error: null },
  );
}

describe("POST /api/items/:id/tags", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    upsertCalls = [];
    insertCalls = [];
  });

  it("returns 400 for a malformed item id without touching the database", async () => {
    const response = await POST(requestFor({ name: "js" }), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid tag name", async () => {
    const response = await POST(requestFor({ name: "" }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item isn't owned/doesn't exist/is trashed", async () => {
    queueResponse("knowledge_items", { data: null, error: null });

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(404);
  });

  it("creates a brand-new tag and attaches it", async () => {
    allowItemOwnership();
    queueResponse("tags", { data: [], error: null }); // no existing tags
    queueResponse("tags", { data: { id: "tag-1", name: "js" }, error: null }); // insert
    queueResponse("knowledge_item_tags", { data: null, error: null }); // upsert (attach)
    queueFinalTags([{ id: "tag-1", name: "js" }]);

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toMatchObject({ owner_id: "user-1", name: "js" });
    expect(await response.json()).toEqual({
      tag: { id: "tag-1", name: "js" },
      tags: [{ id: "tag-1", name: "js" }],
    });
  });

  it("reuses an existing tag matched case-insensitively (no duplicate tag row)", async () => {
    allowItemOwnership();
    queueResponse("tags", { data: [{ id: "tag-1", name: "JavaScript" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: null }); // upsert (attach)
    queueFinalTags([{ id: "tag-1", name: "JavaScript" }]);

    const response = await POST(requestFor({ name: "javascript" }), { params });

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(0);
    expect(upsertCalls[0][0]).toMatchObject({ knowledge_item_id: VALID_ID, tag_id: "tag-1" });
  });

  it("attaching an already-attached tag is a no-op success, not an error", async () => {
    allowItemOwnership();
    queueResponse("tags", { data: [{ id: "tag-1", name: "js" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: null }); // ignoreDuplicates upsert
    queueFinalTags([{ id: "tag-1", name: "js" }]);

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(201);
    expect(upsertCalls[0][1]).toMatchObject({ ignoreDuplicates: true });
  });

  it("returns 500 and logs when attaching fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowItemOwnership();
    queueResponse("tags", { data: [{ id: "tag-1", name: "js" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } });

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still returns 201 with the attached tag when the attach succeeds but the post-attach tags read fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowItemOwnership();
    queueResponse("tags", { data: [{ id: "tag-1", name: "js" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: null }); // upsert (attach) succeeds
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } }); // re-read fails

    const response = await POST(requestFor({ name: "js" }), { params });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ tag: { id: "tag-1", name: "js" }, tags: null });
    consoleError.mockRestore();
  });
});
