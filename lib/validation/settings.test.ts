import { describe, expect, it } from "vitest";

import { profileUpdateSchema } from "./settings";

describe("profileUpdateSchema", () => {
  it("accepts an empty payload (no fields being updated)", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a display_name update", () => {
    const result = profileUpdateSchema.safeParse({ display_name: "Ada Lovelace" });
    expect(result.success).toBe(true);
  });

  it("rejects a display_name over 100 characters", () => {
    const result = profileUpdateSchema.safeParse({ display_name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("accepts an avatar_path update, including null to clear it", () => {
    expect(
      profileUpdateSchema.safeParse({ avatar_path: "user-1/avatar.png" }).success,
    ).toBe(true);
    expect(profileUpdateSchema.safeParse({ avatar_path: null }).success).toBe(true);
  });
});
