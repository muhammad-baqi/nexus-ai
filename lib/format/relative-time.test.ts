import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  it("returns 'just now' for under a minute", () => {
    expect(formatRelativeTime("2026-08-04T11:59:30.000Z", now)).toBe("just now");
  });

  it("returns singular/plural minutes", () => {
    expect(formatRelativeTime("2026-08-04T11:59:00.000Z", now)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-08-04T11:55:00.000Z", now)).toBe("5 minutes ago");
  });

  it("returns singular/plural hours", () => {
    expect(formatRelativeTime("2026-08-04T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(formatRelativeTime("2026-08-04T09:00:00.000Z", now)).toBe("3 hours ago");
  });

  it("returns singular/plural days", () => {
    expect(formatRelativeTime("2026-08-03T12:00:00.000Z", now)).toBe("1 day ago");
    expect(formatRelativeTime("2026-08-01T12:00:00.000Z", now)).toBe("3 days ago");
  });

  it("falls back to a locale date string past 7 days", () => {
    const eightDaysAgo = "2026-07-27T12:00:00.000Z";
    expect(formatRelativeTime(eightDaysAgo, now)).toBe(new Date(eightDaysAgo).toLocaleDateString());
  });
});
