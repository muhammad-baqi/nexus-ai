import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

let queues: Record<string, ResolvedValue[]>;
let updateCalls: unknown[][];

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
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

import { DELETE, PATCH } from "./route";

function requestFor(method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/reminders/${VALID_ID}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

function allowReminderOwnership() {
  queueResponse("reminders", { data: { id: VALID_ID }, error: null }); // verifyReminderOwnership
}

const FUTURE_DATE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

describe("PATCH /api/reminders/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    updateCalls = [];
  });

  it("returns 400 for a malformed reminder id", async () => {
    const response = await PATCH(requestFor("PATCH", { type: "daily", hour: 9, minute: 0 }), {
      params: invalidParams,
    });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the reminder isn't owned/doesn't exist", async () => {
    queueResponse("reminders", { data: null, error: null }); // verifyReminderOwnership fails
    const response = await PATCH(requestFor("PATCH", { type: "daily", hour: 9, minute: 0 }), { params });
    expect(response.status).toBe(404);
  });

  it("changing the time reschedules next_fire_at without touching last_fired_at", async () => {
    allowReminderOwnership();
    queueResponse("reminders", {
      data: { id: VALID_ID, type: "daily", schedule: { hour: 18, minute: 0 }, next_fire_at: FUTURE_DATE, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await PATCH(requestFor("PATCH", { type: "daily", hour: 18, minute: 0 }), { params });

    expect(response.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const updated = updateCalls[0][0] as Record<string, unknown>;
    expect(updated).not.toHaveProperty("last_fired_at");
    expect(updated.schedule).toEqual({ hour: 18, minute: 0 });
  });
});

describe("DELETE /api/reminders/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queues = {};
    builders = {};
    updateCalls = [];
  });

  it("returns 400 for a malformed reminder id", async () => {
    const response = await DELETE(requestFor("DELETE"), { params: invalidParams });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the reminder isn't owned/doesn't exist", async () => {
    queueResponse("reminders", { data: null, error: null });
    const response = await DELETE(requestFor("DELETE"), { params });
    expect(response.status).toBe(404);
  });

  it("sets is_active=false — the row is soft-cancelled, not deleted", async () => {
    allowReminderOwnership();
    queueResponse("reminders", {
      data: { id: VALID_ID, type: "daily", schedule: { hour: 9, minute: 0 }, next_fire_at: FUTURE_DATE, is_active: false, created_at: "2026-01-01T00:00:00.000Z" },
      error: null,
    });

    const response = await DELETE(requestFor("DELETE"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateCalls[0][0]).toEqual({ is_active: false });
    expect(body.reminder.is_active).toBe(false);
  });
});
