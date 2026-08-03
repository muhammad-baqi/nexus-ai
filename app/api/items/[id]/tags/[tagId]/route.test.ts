import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_TAG_ID = "223e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq", "is", "delete"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
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

import { DELETE } from "./route";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/tags/${VALID_TAG_ID}`, {
    method: "DELETE",
  });
}

const params = Promise.resolve({ id: VALID_ID, tagId: VALID_TAG_ID });
const invalidItemParams = Promise.resolve({ id: "not-a-uuid", tagId: VALID_TAG_ID });
const invalidTagParams = Promise.resolve({ id: VALID_ID, tagId: "not-a-uuid" });

function allowItemOwnership() {
  queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
}

describe("DELETE /api/items/:id/tags/:tagId", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
  });

  it("returns 400 for a malformed item id without touching the database", async () => {
    const response = await DELETE(requestFor(), { params: invalidItemParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed tag id without touching the database", async () => {
    const response = await DELETE(requestFor(), { params: invalidTagParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item isn't owned / doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: null });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(404);
  });

  it("detaches the tag, leaving the item's other tags untouched", async () => {
    allowItemOwnership();
    queueResponse("knowledge_item_tags", { data: null, error: null }); // delete
    queueResponse("knowledge_item_tags", {
      data: [{ tags: { id: "tag-2", name: "keep-me" } }],
      error: null,
    }); // re-fetch

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(builders.knowledge_item_tags.delete).toHaveBeenCalled();
    expect(builders.knowledge_item_tags.eq).toHaveBeenCalledWith("tag_id", VALID_TAG_ID);
    expect(await response.json()).toEqual({ tags: [{ id: "tag-2", name: "keep-me" }] });
  });

  it("detaching a tag that isn't attached is idempotent success, not 404", async () => {
    allowItemOwnership();
    queueResponse("knowledge_item_tags", { data: null, error: null }); // delete: 0 rows, no error
    queueResponse("knowledge_item_tags", { data: [], error: null });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
  });

  it("returns 500 and logs when the detach query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowItemOwnership();
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still returns 200 with tags: null when the detach succeeds but the post-detach tags read fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowItemOwnership();
    queueResponse("knowledge_item_tags", { data: null, error: null }); // delete succeeds
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } }); // re-read fails

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tags: null });
    consoleError.mockRestore();
  });
});
