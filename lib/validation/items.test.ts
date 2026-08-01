import { describe, expect, it } from "vitest";

import { createNoteSchema, updateItemSchema } from "./items";

describe("createNoteSchema", () => {
  it("rejects a missing collection_id", () => {
    const result = createNoteSchema.safeParse({ title: "Trip planning" });

    expect(result.success).toBe(false);
  });

  it("rejects a malformed collection_id", () => {
    const result = createNoteSchema.safeParse({ collection_id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    const result = createNoteSchema.safeParse({
      collection_id: "123e4567-e89b-12d3-a456-426614174000",
      title: "a".repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a payload with only collection_id", () => {
    const result = createNoteSchema.safeParse({
      collection_id: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.success).toBe(true);
  });
});

describe("updateItemSchema", () => {
  it("rejects an empty payload", () => {
    const result = updateItemSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    const result = updateItemSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
  });

  it("accepts a description-only update", () => {
    const result = updateItemSchema.safeParse({ description: "Updated body" });

    expect(result.success).toBe(true);
  });

  it("accepts description set to null", () => {
    const result = updateItemSchema.safeParse({ description: null });

    expect(result.success).toBe(true);
  });
});
