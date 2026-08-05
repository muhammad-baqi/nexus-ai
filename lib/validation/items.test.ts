import { describe, expect, it } from "vitest";

import { createBookmarkSchema, createNoteSchema, updateItemSchema } from "./items";

const VALID_COLLECTION_ID = "123e4567-e89b-12d3-a456-426614174000";

describe("createNoteSchema", () => {
  it("rejects a missing collection_id", () => {
    const result = createNoteSchema.safeParse({ type: "note", title: "Trip planning" });

    expect(result.success).toBe(false);
  });

  it("rejects a missing/wrong type", () => {
    expect(createNoteSchema.safeParse({ collection_id: VALID_COLLECTION_ID }).success).toBe(false);
    expect(
      createNoteSchema.safeParse({ type: "website", collection_id: VALID_COLLECTION_ID }).success,
    ).toBe(false);
  });

  it("rejects a malformed collection_id", () => {
    const result = createNoteSchema.safeParse({ type: "note", collection_id: "not-a-uuid" });

    expect(result.success).toBe(false);
  });

  it("rejects a title over 200 characters", () => {
    const result = createNoteSchema.safeParse({
      type: "note",
      collection_id: VALID_COLLECTION_ID,
      title: "a".repeat(201),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a payload with only type + collection_id", () => {
    const result = createNoteSchema.safeParse({ type: "note", collection_id: VALID_COLLECTION_ID });

    expect(result.success).toBe(true);
  });
});

describe("createBookmarkSchema", () => {
  function payload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      type: "website",
      collection_id: VALID_COLLECTION_ID,
      url: "https://example.com/article",
      ...overrides,
    };
  }

  it("accepts a valid http(s) URL", () => {
    expect(createBookmarkSchema.safeParse(payload()).success).toBe(true);
    expect(createBookmarkSchema.safeParse(payload({ url: "http://example.com" })).success).toBe(
      true,
    );
  });

  it("rejects an invalid URL format", () => {
    expect(createBookmarkSchema.safeParse(payload({ url: "not a url" })).success).toBe(false);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(createBookmarkSchema.safeParse(payload({ url: "javascript:alert(1)" })).success).toBe(
      false,
    );
    expect(createBookmarkSchema.safeParse(payload({ url: "ftp://example.com/file" })).success).toBe(
      false,
    );
  });

  it("rejects a missing/wrong type", () => {
    expect(createBookmarkSchema.safeParse(payload({ type: undefined })).success).toBe(false);
    expect(createBookmarkSchema.safeParse(payload({ type: "note" })).success).toBe(false);
  });

  it("confirmDuplicate is optional and defaults to unset", () => {
    const result = createBookmarkSchema.safeParse(payload());

    expect(result.success && result.data.confirmDuplicate).toBeUndefined();
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
