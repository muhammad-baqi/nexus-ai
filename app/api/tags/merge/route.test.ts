import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const SOURCE_ID = "123e4567-e89b-12d3-a456-426614174000";
const TARGET_ID = "223e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

// Per-table FIFO queue: this route makes more than one Supabase call against both `tags` (an
// ownership select, then a delete) and `knowledge_item_tags` (a select, then an upsert) —
// mirrors the pattern app/api/items/[id]/route.test.ts already uses for the same reason.
let queues: Record<string, ResolvedValue[]>;
let upsertCalls: unknown[][];

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "delete", "eq", "in"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.upsert = vi.fn((...args: unknown[]) => {
    upsertCalls.push(args);
    return builder;
  });
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
  return new NextRequest("http://localhost:3000/api/tags/merge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function allowBothTagsOwned() {
  queueResponse("tags", { data: [{ id: SOURCE_ID }, { id: TARGET_ID }], error: null });
}

describe("POST /api/tags/merge", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    upsertCalls = [];
  });

  it("returns 400 when source_tag_id === target_tag_id, without touching the database", async () => {
    const response = await POST(
      requestFor({ source_tag_id: SOURCE_ID, target_tag_id: SOURCE_ID }),
    );

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(401);
  });

  it("returns 404 when either tag isn't owned / doesn't exist", async () => {
    queueResponse("tags", { data: [{ id: SOURCE_ID }], error: null }); // only one of the two found

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(404);
  });

  it("reassigns every item from source to target and deletes the source tag", async () => {
    allowBothTagsOwned();
    queueResponse("knowledge_item_tags", {
      data: [{ knowledge_item_id: "item-1" }, { knowledge_item_id: "item-2" }],
      error: null,
    });
    queueResponse("knowledge_item_tags", { data: null, error: null }); // upsert
    queueResponse("tags", { data: null, error: null }); // delete source

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0][0]).toEqual([
      { knowledge_item_id: "item-1", tag_id: TARGET_ID },
      { knowledge_item_id: "item-2", tag_id: TARGET_ID },
    ]);
    expect(upsertCalls[0][1]).toMatchObject({ ignoreDuplicates: true });
    expect(builders.tags.delete).toHaveBeenCalled();
  });

  it("merging when an item already has both tags doesn't error (ignoreDuplicates, not a 500)", async () => {
    allowBothTagsOwned();
    queueResponse("knowledge_item_tags", { data: [{ knowledge_item_id: "item-1" }], error: null });
    // The composite-PK conflict is exactly what ignoreDuplicates is for — the upsert call
    // resolves with no error even though item-1 already carries the target tag.
    queueResponse("knowledge_item_tags", { data: null, error: null });
    queueResponse("tags", { data: null, error: null });

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(200);
  });

  it("skips the reassign upsert entirely when the source tag has no items", async () => {
    allowBothTagsOwned();
    queueResponse("knowledge_item_tags", { data: [], error: null });
    queueResponse("tags", { data: null, error: null }); // delete source

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(0);
  });

  it("a failure deleting the source tag after reassignment logs and returns 500", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowBothTagsOwned();
    queueResponse("knowledge_item_tags", { data: [{ knowledge_item_id: "item-1" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: null }); // upsert succeeds
    queueResponse("tags", { data: null, error: { message: "delete failed" } });

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("merge_incomplete");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("a failure reassigning items is logged and returns 500 without deleting the source tag", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    allowBothTagsOwned();
    queueResponse("knowledge_item_tags", { data: [{ knowledge_item_id: "item-1" }], error: null });
    queueResponse("knowledge_item_tags", { data: null, error: { message: "upsert failed" } });

    const response = await POST(requestFor({ source_tag_id: SOURCE_ID, target_tag_id: TARGET_ID }));

    expect(response.status).toBe(500);
    expect(builders.tags?.delete).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
