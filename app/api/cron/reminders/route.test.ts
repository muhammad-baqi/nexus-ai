import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendReminderEmail } = vi.hoisted(() => ({ sendReminderEmail: vi.fn() }));
vi.mock("@/lib/email/send-reminder-email", () => ({ sendReminderEmail }));

const getUserById = vi.fn();

type ResolvedValue = { data: unknown; error: unknown };

let dueRemindersQueue: ResolvedValue[];
let profileQueue: Record<string, ResolvedValue>;
let updateCalls: Record<string, unknown[][]>;

function createRemindersQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "eq", "lte", "is", "or"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.update = vi.fn((...args: unknown[]) => {
    (updateCalls.reminders ??= []).push(args);
    return builder;
  });
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    resolve(dueRemindersQueue.length > 0 ? dueRemindersQueue.shift()! : { data: [], error: null });
  };
  return builder;
}

function createProfilesQueryBuilder() {
  const builder: Record<string, unknown> = {};
  let ownerId: string | undefined;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((_col: string, value: string) => {
    ownerId = value;
    return builder;
  });
  builder.single = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    resolve(profileQueue[ownerId ?? ""] ?? { data: { notification_email_enabled: true }, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById } },
    from: (table: string) => (table === "reminders" ? createRemindersQueryBuilder() : createProfilesQueryBuilder()),
  }),
}));

import { GET } from "./route";

const OWNER_ID = "owner-1";
const NOW = new Date("2026-08-04T12:00:00.000Z");

function makeReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    type: "daily",
    schedule: { hour: 12, minute: 0 },
    next_fire_at: "2026-08-04T12:00:00.000Z",
    failure_count: 0,
    knowledge_items: { id: "item-1", title: "Follow up", description: "Do the thing", owner_id: OWNER_ID },
    ...overrides,
  };
}

// The route's very first write per request is always the atomic claim UPDATE
// (`{ claimed_at: ... }`) — every per-reminder resolution update this file asserts on is
// whatever comes after that, so this always grabs the most recent one rather than hardcoding an
// index that shifted once the claim step was added (self-review-caught: no claim/lock existed
// before, so every assertion here originally pointed at index 0).
function lastReminderUpdate(): Record<string, unknown> {
  const calls = updateCalls.reminders ?? [];
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

function requestWithSecret(secret?: string) {
  return new NextRequest("http://localhost:3000/api/cron/reminders", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("GET /api/cron/reminders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("CRON_SECRET", "test-secret");
    sendReminderEmail.mockReset();
    sendReminderEmail.mockResolvedValue({ ok: true });
    getUserById.mockReset();
    getUserById.mockResolvedValue({ data: { user: { email: "owner@example.com" } }, error: null });
    dueRemindersQueue = [];
    profileQueue = {};
    updateCalls = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns 401 and processes nothing when the secret is missing", async () => {
    const response = await GET(requestWithSecret());
    expect(response.status).toBe(401);
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is wrong", async () => {
    const response = await GET(requestWithSecret("wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("claims due reminders via an atomic UPDATE before processing them", async () => {
    dueRemindersQueue.push({ data: [makeReminder()], error: null });

    await GET(requestWithSecret("test-secret"));

    const claimUpdate = updateCalls.reminders[0][0] as { claimed_at: string };
    expect(claimUpdate.claimed_at).toBe(NOW.toISOString());
  });

  it("sends a due reminder and advances next_fire_at for a recurring type", async () => {
    dueRemindersQueue.push({ data: [makeReminder()], error: null });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(sendReminderEmail).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ id: "item-1" }));
    const update = lastReminderUpdate() as { is_active: boolean; next_fire_at: string; last_fired_at: string };
    expect(update.is_active).toBe(true);
    expect(new Date(update.next_fire_at).getTime()).toBeGreaterThan(NOW.getTime());
    expect(update.last_fired_at).toBe(NOW.toISOString());
  });

  it("deactivates a one_time reminder after sending", async () => {
    dueRemindersQueue.push({ data: [makeReminder({ type: "one_time", schedule: {} })], error: null });

    await GET(requestWithSecret("test-secret"));

    const update = lastReminderUpdate() as { is_active: boolean };
    expect(update.is_active).toBe(false);
  });

  it("skips sending when the owner's email toggle is off, but still advances the reminder", async () => {
    dueRemindersQueue.push({ data: [makeReminder()], error: null });
    profileQueue[OWNER_ID] = { data: { notification_email_enabled: false }, error: null };

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.toggle_off).toBe(1);
    expect(sendReminderEmail).not.toHaveBeenCalled();
    // The claim UPDATE plus this one resolution update — never a second send-adjacent write.
    expect(updateCalls.reminders).toHaveLength(2);
  });

  it("logs and skips a reminder whose owner has no email on file, but still advances it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUserById.mockResolvedValue({ data: { user: { email: null } }, error: null });
    dueRemindersQueue.push({ data: [makeReminder()], error: null });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.no_email).toBe(1);
    expect(sendReminderEmail).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    expect((lastReminderUpdate() as { is_active: boolean }).is_active).toBe(true);
    consoleError.mockRestore();
  });

  it("logs a reminder more than 24h past due as missed, without sending", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dueRemindersQueue.push({
      data: [makeReminder({ next_fire_at: "2026-08-03T10:00:00.000Z" })], // 26h before NOW
      error: null,
    });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.missed).toBe(1);
    expect(sendReminderEmail).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("backs off on a send failure instead of retrying immediately — next_fire_at stays anchored, only failure_count and claimed_at change", async () => {
    sendReminderEmail.mockResolvedValue({ ok: false });
    dueRemindersQueue.push({ data: [makeReminder({ failure_count: 1 })], error: null });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.backoff).toBe(1);
    const update = lastReminderUpdate() as { failure_count: number; next_fire_at?: string; is_active?: boolean; claimed_at: null };
    expect(update.failure_count).toBe(2);
    expect(update.is_active).toBeUndefined(); // untouched — still active, no advance/deactivate yet
    expect(update.next_fire_at).toBeUndefined(); // untouched — the self-review-caught drift bug's fix
    expect(update.claimed_at).toBeNull(); // reclaimable on the scheduler's next run
  });

  it("gives up and advances/deactivates after 5 consecutive failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendReminderEmail.mockResolvedValue({ ok: false });
    dueRemindersQueue.push({ data: [makeReminder({ failure_count: 4 })], error: null });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.gave_up).toBe(1);
    const update = lastReminderUpdate() as { failure_count: number; is_active: boolean };
    expect(update.failure_count).toBe(0);
    expect(update.is_active).toBe(true); // recurring type — advances, doesn't stay stuck
    consoleError.mockRestore();
  });

  it("one reminder throwing doesn't stop the rest of the batch", async () => {
    sendReminderEmail
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true });
    dueRemindersQueue.push({
      data: [makeReminder({ id: "r1" }), makeReminder({ id: "r2" })],
      error: null,
    });

    const response = await GET(requestWithSecret("test-secret"));
    const body = await response.json();

    expect(body.processed).toBe(2);
    expect(body.error).toBe(1);
    expect(body.sent).toBe(1);
  });
});
