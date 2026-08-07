import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;
let insertCalls: unknown[][];
let updateCalls: unknown[][];

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
  builder.update = vi.fn((...args: unknown[]) => {
    updateCalls.push(args);
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

// Isolates logActivity's own insert (already covered by log-activity.test.ts) from this file's
// shared insertCalls tracking, which isn't scoped per table.
vi.mock("@/lib/activity/log-activity", () => ({ logActivity: vi.fn() }));

import { DELETE, POST } from "./route";

function requestFor(method: "POST" | "DELETE") {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/share`, { method });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function allowItemOwnership() {
  queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
}

describe("POST /api/items/:id/share", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    insertCalls = [];
    updateCalls = [];
  });

  it("returns 400 for a malformed item id without touching the database", async () => {
    const response = await POST(requestFor("POST"), { params: invalidParams });
    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 404 when the item isn't owned/doesn't exist/is trashed", async () => {
    queueResponse("knowledge_items", { data: null, error: null });
    const response = await POST(requestFor("POST"), { params });
    expect(response.status).toBe(404);
  });

  it("creates a new share link when none is active", async () => {
    allowItemOwnership();
    queueResponse("share_links", { data: null, error: null }); // no existing active link
    queueResponse("share_links", { data: { token: "new-token" }, error: null }); // insert

    const response = await POST(requestFor("POST"), { params });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toMatchObject({ knowledge_item_id: VALID_ID });
    expect(body.token).toBe("new-token");
    expect(body.url).toContain("/share/new-token");
  });

  it("returns the existing active link instead of creating a duplicate", async () => {
    allowItemOwnership();
    queueResponse("share_links", { data: { token: "existing-token" }, error: null });

    const response = await POST(requestFor("POST"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(insertCalls).toHaveLength(0);
    expect(body.token).toBe("existing-token");
  });
});

describe("DELETE /api/items/:id/share", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    insertCalls = [];
    updateCalls = [];
  });

  it("returns 400 for a malformed item id", async () => {
    const response = await DELETE(requestFor("DELETE"), { params: invalidParams });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the item isn't owned/doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: null });
    const response = await DELETE(requestFor("DELETE"), { params });
    expect(response.status).toBe(404);
  });

  it("soft-revokes the active link (is_active=false, no row delete)", async () => {
    allowItemOwnership();
    queueResponse("share_links", { data: null, error: null });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toEqual({ is_active: false });
  });
});
