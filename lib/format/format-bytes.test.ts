import { describe, expect, it } from "vitest";

import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("formats sub-1KB sizes in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats KB with one decimal under 10, whole number at/above 10", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(15 * 1024)).toBe("15 KB");
  });

  it("formats MB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats GB", () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });
});
