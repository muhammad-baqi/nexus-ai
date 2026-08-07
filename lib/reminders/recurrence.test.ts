import { describe, expect, it } from "vitest";

import { computeNextFireAt, lastDayOfMonth } from "./recurrence";

describe("computeNextFireAt", () => {
  it("one_time has no next occurrence", () => {
    expect(computeNextFireAt("one_time", {}, new Date("2026-08-04T12:00:00.000Z"))).toBeNull();
  });

  it("daily: rolls to today if the time hasn't passed yet", () => {
    const from = new Date("2026-08-04T08:00:00.000Z");
    const next = computeNextFireAt("daily", { hour: 14, minute: 30 }, from);
    expect(next?.toISOString()).toBe("2026-08-04T14:30:00.000Z");
  });

  it("daily: rolls to tomorrow if the time has already passed today", () => {
    const from = new Date("2026-08-04T16:00:00.000Z");
    const next = computeNextFireAt("daily", { hour: 14, minute: 30 }, from);
    expect(next?.toISOString()).toBe("2026-08-05T14:30:00.000Z");
  });

  it("daily: advancing from an exact prior occurrence always moves to the next day", () => {
    const from = new Date("2026-08-04T14:30:00.000Z");
    const next = computeNextFireAt("daily", { hour: 14, minute: 30 }, from);
    expect(next?.toISOString()).toBe("2026-08-05T14:30:00.000Z");
  });

  it("weekly: finds the next matching day of week", () => {
    // 2026-08-04 is a Tuesday (day 2); next Friday (day 5) at 09:00.
    const from = new Date("2026-08-04T12:00:00.000Z");
    const next = computeNextFireAt("weekly", { hour: 9, minute: 0, dayOfWeek: 5 }, from);
    expect(next?.toISOString()).toBe("2026-08-07T09:00:00.000Z");
    expect(next?.getUTCDay()).toBe(5);
  });

  it("weekly: same day but time already passed rolls a full week forward", () => {
    // 2026-08-04 is a Tuesday; asking for Tuesday at an already-passed time should land on
    // 2026-08-11, not today.
    const from = new Date("2026-08-04T12:00:00.000Z");
    const next = computeNextFireAt("weekly", { hour: 9, minute: 0, dayOfWeek: 2 }, from);
    expect(next?.toISOString()).toBe("2026-08-11T09:00:00.000Z");
  });

  it("monthly: happy path within the same month", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const next = computeNextFireAt("monthly", { hour: 10, minute: 0, dayOfMonth: 15 }, from);
    expect(next?.toISOString()).toBe("2026-08-15T10:00:00.000Z");
  });

  it("monthly: day 31 falls back to the 30th in a 30-day month", () => {
    // After this month's own (valid, 31st-of-August) occurrence has already passed, the next one
    // rolls into September — a 30-day month — and clamps to its last day.
    const from = new Date("2026-08-31T10:00:00.000Z");
    const next = computeNextFireAt("monthly", { hour: 9, minute: 0, dayOfMonth: 31 }, from);
    expect(next?.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(next?.getUTCDate()).toBe(30);
  });

  it("monthly: day 31 falls back to Feb 28 in a non-leap year", () => {
    const from = new Date("2027-01-31T10:00:00.000Z"); // 2027 is not a leap year
    const next = computeNextFireAt("monthly", { hour: 9, minute: 0, dayOfMonth: 31 }, from);
    expect(next?.getUTCFullYear()).toBe(2027);
    expect(next?.getUTCMonth()).toBe(1); // February
    expect(next?.getUTCDate()).toBe(28);
  });

  it("monthly: day 31 falls back to Feb 29 in a leap year", () => {
    const from = new Date("2028-01-31T10:00:00.000Z"); // 2028 is a leap year
    const next = computeNextFireAt("monthly", { hour: 9, minute: 0, dayOfMonth: 31 }, from);
    expect(next?.getUTCFullYear()).toBe(2028);
    expect(next?.getUTCMonth()).toBe(1); // February
    expect(next?.getUTCDate()).toBe(29);
  });

  it("monthly: advancing from a clamped occurrence returns to the real day next month if it exists", () => {
    // Fired on Feb 28 (clamped from 31); the next occurrence is March 31, the real day again.
    const from = new Date("2027-02-28T09:00:00.000Z");
    const next = computeNextFireAt("monthly", { hour: 9, minute: 0, dayOfMonth: 31 }, from);
    expect(next?.getUTCMonth()).toBe(2); // March
    expect(next?.getUTCDate()).toBe(31);
  });

  it("custom every_n_days: advances by the configured interval", () => {
    const from = new Date("2026-08-04T09:00:00.000Z");
    const next = computeNextFireAt(
      "custom",
      { kind: "every_n_days", hour: 9, minute: 0, intervalDays: 3 },
      from,
    );
    expect(next?.toISOString()).toBe("2026-08-07T09:00:00.000Z");
  });

  it("custom every_weekday: skips Saturday and Sunday", () => {
    // 2026-08-07 is a Friday; the next weekday occurrence should be Monday 2026-08-10.
    const from = new Date("2026-08-07T09:00:00.000Z");
    const next = computeNextFireAt("custom", { kind: "every_weekday", hour: 9, minute: 0 }, from);
    expect(next?.toISOString()).toBe("2026-08-10T09:00:00.000Z");
    expect(next?.getUTCDay()).not.toBe(0);
    expect(next?.getUTCDay()).not.toBe(6);
  });
});

describe("lastDayOfMonth", () => {
  it("returns 31 for a 31-day month", () => {
    expect(lastDayOfMonth(2026, 7)).toBe(31); // August (0-indexed)
  });

  it("returns 30 for a 30-day month", () => {
    expect(lastDayOfMonth(2026, 8)).toBe(30); // September
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(lastDayOfMonth(2027, 1)).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(lastDayOfMonth(2028, 1)).toBe(29);
  });
});
