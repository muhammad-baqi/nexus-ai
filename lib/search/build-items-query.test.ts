import { describe, expect, it } from "vitest";

import { buildItemsSearchParams, hasActiveFilters } from "./build-items-query";

describe("buildItemsSearchParams", () => {
  it("produces an empty querystring for no filters", () => {
    expect(buildItemsSearchParams({}).toString()).toBe("");
  });

  it("includes q when set", () => {
    expect(buildItemsSearchParams({ q: "zephyrus" }).toString()).toBe("q=zephyrus");
  });

  it("combines multiple filter categories (AND across categories)", () => {
    const params = buildItemsSearchParams({
      q: "zephyrus",
      type: "note",
      collectionId: "col-1",
      favorite: true,
    });

    expect(params.get("q")).toBe("zephyrus");
    expect(params.get("type")).toBe("note");
    expect(params.get("collection_id")).toBe("col-1");
    expect(params.get("favorite")).toBe("true");
  });

  it("appends one tag param per id (OR within the tag filter)", () => {
    const params = buildItemsSearchParams({ tagIds: ["tag-1", "tag-2"] });

    expect(params.getAll("tag")).toEqual(["tag-1", "tag-2"]);
  });

  it("serializes favorite: false explicitly rather than omitting it", () => {
    const params = buildItemsSearchParams({ favorite: false });

    expect(params.get("favorite")).toBe("false");
  });

  it("omits page when it's 1 (the default), includes it otherwise", () => {
    expect(buildItemsSearchParams({ page: 1 }).has("page")).toBe(false);
    expect(buildItemsSearchParams({ page: 2 }).get("page")).toBe("2");
  });

  it("includes date range params", () => {
    const params = buildItemsSearchParams({ createdFrom: "2026-01-01", createdTo: "2026-02-01" });

    expect(params.get("created_from")).toBe("2026-01-01");
    expect(params.get("created_to")).toBe("2026-02-01");
  });
});

describe("hasActiveFilters", () => {
  it("is false with nothing set", () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it("is false with only page set", () => {
    expect(hasActiveFilters({ page: 2 })).toBe(false);
  });

  it("is true when q is set", () => {
    expect(hasActiveFilters({ q: "x" })).toBe(true);
  });

  it("is true when only a boolean filter is explicitly false", () => {
    expect(hasActiveFilters({ favorite: false })).toBe(true);
  });

  it("is true when only tags are set", () => {
    expect(hasActiveFilters({ tagIds: ["tag-1"] })).toBe(true);
  });
});
