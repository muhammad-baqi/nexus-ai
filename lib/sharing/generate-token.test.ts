import { describe, expect, it } from "vitest";

import { generateShareToken } from "./generate-token";

describe("generateShareToken", () => {
  it("returns a URL-safe token with no repeated collisions across many calls", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
