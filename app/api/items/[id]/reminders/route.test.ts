import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;
let insertCalls: unknown[][];

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq", "is", "order"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.insert = vi.fn((...args: unknown[]) => {
    insertCalls.push(args);
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

import { GET, POST } from "./route";

function requestFor(body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/reminders`, {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function allowItemOwnership() {
  queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });
}

const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST_DATE = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("GET /api/items/:id/reminders", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    insertCalls = [];
  });

  it("returns 400 for a malformed item id", async () => {
    const response = await GET(requestFor(), { params: invalidParams });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the item isn't owned/doesn't exist/is trashed", async () => {
    queueResponse("knowledge_items", { data: null, error: null });
    const response = await GET(requestFor(), { params });
    expect(response.status).toBe(404);
  });

  it("returns both active and cancelled reminders", async () => {
    allowItemOwnership();
    queueResponse("reminders", {
      data: [
        { id: "r1", type: "daily", schedule: { hour: 9, minute: 0 }, next_fire_at: FUTURE_DATE, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "r2", type: "one_time", schedule: {}, next_fire_at: PAST_DATE, is_active: false, created_at: "2026-01-01T00:00:00.000Z" },
      ],
      error: null,
    });

    const response = await GET(requestFor(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reminders).toHaveLength(2);
    expect(body.reminders.some((r: { is_active: boolean }) => r.is_active === false)).toBe(true);
  });
});

describe("POST /api/items/:id/reminders", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    insertCalls = [];
  });

  it("returns 400 for a malformed item id without touching the database", async () => {
    const response = await POST(requestFor({ type: "daily", hour: 9, minute: 0 }), { params: invalidParams });
    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("rejects a one_time reminder with a past date, no row created", async () => {
    allowItemOwnership();
    const response = await POST(requestFor({ type: "one_time", fire_at: PAST_DATE }), { params });
    expect(response.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });

  it.each([
    ["one_time", { type: "one_time", fire_at: FUTURE_DATE }],
    ["daily", { type: "daily", hour: 9, minute: 30 }],
    ["weekly", { type: "weekly", hour: 9, minute: 30, dayOfWeek: 3 }],
    ["monthly", { type: "monthly", hour: 9, minute: 30, dayOfMonth: 15 }],
    ["custom every_n_days", { type: "custom", kind: "every_n_days", hour: 9, minute: 30, intervalDays: 3 }],
    ["custom every_weekday", { type: "custom", kind: "every_weekday", hour: 9, minute: 30 }],
  ])("creates a %s reminder with a computed next_fire_at", async (_label, payload) => {
    allowItemOwnership();
    queueResponse("reminders", {
      data: { id: "r1", type: payload.type, schedule: {}, next_fire_at: FUTURE_DATE, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await POST(requestFor(payload), { params });

    expect(response.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0][0] as { next_fire_at: string | null; type: string };
    expect(inserted.type).toBe(payload.type);
    expect(inserted.next_fire_at).not.toBeNull();
  });

  it("allows a second active reminder on the same item", async () => {
    allowItemOwnership();
    queueResponse("reminders", {
      data: { id: "r2", type: "daily", schedule: {}, next_fire_at: FUTURE_DATE, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await POST(requestFor({ type: "daily", hour: 8, minute: 0 }), { params });

    expect(response.status).toBe(201);
  });
});
