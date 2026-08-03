import { describe, expect, it } from "vitest";

import { mergeTagsSchema, tagNameSchema } from "./tags";

const VALID_ID_A = "123e4567-e89b-12d3-a456-426614174000";
const VALID_ID_B = "223e4567-e89b-12d3-a456-426614174000";

describe("tagNameSchema", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(tagNameSchema.safeParse("").success).toBe(false);
    expect(tagNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a name over 50 characters", () => {
    expect(tagNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });

  it("accepts a valid name, trimmed", () => {
    const result = tagNameSchema.safeParse("  javascript  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("javascript");
  });
});

describe("mergeTagsSchema", () => {
  it("rejects source_tag_id === target_tag_id", () => {
    const result = mergeTagsSchema.safeParse({
      source_tag_id: VALID_ID_A,
      target_tag_id: VALID_ID_A,
    });
    expect(result.success).toBe(false);
  });

  it("accepts two distinct valid ids", () => {
    const result = mergeTagsSchema.safeParse({
      source_tag_id: VALID_ID_A,
      target_tag_id: VALID_ID_B,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed id", () => {
    const result = mergeTagsSchema.safeParse({
      source_tag_id: "not-a-uuid",
      target_tag_id: VALID_ID_B,
    });
    expect(result.success).toBe(false);
  });
});
