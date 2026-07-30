import { describe, expect, it } from "vitest";

import {
  collectionIdSchema,
  createCollectionSchema,
  listCollectionsQuerySchema,
  updateCollectionSchema,
} from "./collections";

describe("createCollectionSchema", () => {
  it("rejects an empty name", () => {
    expect(createCollectionSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCollectionSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 100 characters", () => {
    expect(createCollectionSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
  });

  it("rejects an unrecognized color or icon", () => {
    expect(createCollectionSchema.safeParse({ name: "Inbox", color: "chartreuse" }).success).toBe(
      false,
    );
    expect(createCollectionSchema.safeParse({ name: "Inbox", icon: "rocket" }).success).toBe(
      false,
    );
  });

  it("accepts a minimal valid payload (name only)", () => {
    expect(createCollectionSchema.safeParse({ name: "Inbox" }).success).toBe(true);
  });

  it("accepts a full valid payload", () => {
    const result = createCollectionSchema.safeParse({
      name: "Travel",
      description: "Trip planning",
      color: "blue",
      icon: "map",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateCollectionSchema", () => {
  it("accepts a partial update", () => {
    expect(updateCollectionSchema.safeParse({ is_favorite: true }).success).toBe(true);
    expect(updateCollectionSchema.safeParse({ is_archived: true }).success).toBe(true);
    expect(updateCollectionSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("allows clearing the description with null", () => {
    expect(updateCollectionSchema.safeParse({ description: null }).success).toBe(true);
  });

  it("rejects an empty name if name is being changed", () => {
    expect(updateCollectionSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects an empty update with no fields at all", () => {
    expect(updateCollectionSchema.safeParse({}).success).toBe(false);
  });
});

describe("listCollectionsQuerySchema", () => {
  it("defaults to the active view when no params are given", () => {
    const result = listCollectionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.view).toBe("active");
  });

  it("accepts a valid q and each view value", () => {
    expect(listCollectionsQuerySchema.safeParse({ q: "travel", view: "archived" }).success).toBe(
      true,
    );
    expect(listCollectionsQuerySchema.safeParse({ view: "trashed" }).success).toBe(true);
  });

  it("rejects an invalid view value", () => {
    expect(listCollectionsQuerySchema.safeParse({ view: "deleted" }).success).toBe(false);
  });
});

describe("collectionIdSchema", () => {
  it("accepts a valid UUID", () => {
    expect(
      collectionIdSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success,
    ).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(collectionIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
