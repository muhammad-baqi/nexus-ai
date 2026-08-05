import { describe, expect, it, vi } from "vitest";

import { fetchWebsiteMetadata } from "./website-metadata";

type ResolvedValue = { data: unknown; error: unknown };

function createQueryBuilder() {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    resolveWith: (value: ResolvedValue) => {
      resolvedValue = value;
      return builder;
    },
    then: (resolve: (value: ResolvedValue) => void) => resolve(resolvedValue),
  };
  return builder;
}

function client(builder: ReturnType<typeof createQueryBuilder>) {
  return { from: () => builder } as never;
}

describe("fetchWebsiteMetadata", () => {
  it("returns the metadata row for the item", async () => {
    const builder = createQueryBuilder();
    const row = {
      url: "https://example.com",
      canonical_url: "https://example.com/",
      domain: "example.com",
      og_image_url: null,
      favicon_url: "https://example.com/favicon.ico",
      fetch_status: "success",
    };
    (builder.resolveWith as (v: ResolvedValue) => void)({ data: row, error: null });

    const result = await fetchWebsiteMetadata(client(builder), "item-1");

    expect(result).toEqual(row);
  });

  it("returns null and logs when the query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const builder = createQueryBuilder();
    (builder.resolveWith as (v: ResolvedValue) => void)({ data: null, error: { message: "boom" } });

    const result = await fetchWebsiteMetadata(client(builder), "item-1");

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
