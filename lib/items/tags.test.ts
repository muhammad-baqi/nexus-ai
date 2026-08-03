import { describe, expect, it, vi } from "vitest";

import { fetchItemTags, getOrCreateTag } from "./tags";

type ResolvedValue = { data: unknown; error: unknown };

function createQueryBuilder() {
  let resolvedValue: ResolvedValue = { data: null, error: null };
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => builder),
    resolveWith: (value: ResolvedValue) => {
      resolvedValue = value;
      return builder;
    },
    then: (resolve: (value: ResolvedValue) => void) => resolve(resolvedValue),
  };
  return builder;
}

// Per-table FIFO queue: getOrCreateTag's race-retry path makes three sequential calls against
// `tags` (lookup, failed insert, re-fetch) that each need a different queued response.
function createQueuedBuilder() {
  const queue: ResolvedValue[] = [];
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => builder),
    queue: (value: ResolvedValue) => queue.push(value),
    then: (resolve: (value: ResolvedValue) => void) => {
      resolve(queue.length > 0 ? queue.shift()! : { data: null, error: null });
    },
  };
  return builder;
}

function client(builder: ReturnType<typeof createQueryBuilder>) {
  return { from: () => builder } as never;
}

describe("fetchItemTags", () => {
  it("flattens the joined rows into a sorted list of tags", async () => {
    const builder = createQueryBuilder();
    (builder.resolveWith as (v: ResolvedValue) => void)({
      data: [{ tags: { id: "tag-2", name: "zebra" } }, { tags: { id: "tag-1", name: "apple" } }],
      error: null,
    });

    const result = await fetchItemTags(client(builder), "item-1");

    expect(result).toEqual([
      { id: "tag-1", name: "apple" },
      { id: "tag-2", name: "zebra" },
    ]);
  });

  it("returns an empty array (not null) when the item genuinely has no tags", async () => {
    const builder = createQueryBuilder();
    (builder.resolveWith as (v: ResolvedValue) => void)({ data: [], error: null });

    const result = await fetchItemTags(client(builder), "item-1");

    expect(result).toEqual([]);
  });

  it("returns null and logs when the query fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const builder = createQueryBuilder();
    (builder.resolveWith as (v: ResolvedValue) => void)({ data: null, error: { message: "boom" } });

    const result = await fetchItemTags(client(builder), "item-1");

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("getOrCreateTag", () => {
  it("returns an existing tag matched case-insensitively without inserting", async () => {
    const builder = createQueuedBuilder();
    (builder.queue as (v: ResolvedValue) => void)({
      data: [{ id: "tag-1", name: "JavaScript" }],
      error: null,
    });

    const result = await getOrCreateTag(client(builder), "user-1", "javascript");

    expect(result).toEqual({ id: "tag-1", name: "JavaScript" });
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("creates a new tag when no case-insensitive match exists", async () => {
    const builder = createQueuedBuilder();
    (builder.queue as (v: ResolvedValue) => void)({ data: [], error: null }); // lookup: none
    (builder.queue as (v: ResolvedValue) => void)({ data: { id: "tag-2", name: "rust" }, error: null }); // insert

    const result = await getOrCreateTag(client(builder), "user-1", "rust");

    expect(result).toEqual({ id: "tag-2", name: "rust" });
    expect(builder.insert).toHaveBeenCalledWith({ owner_id: "user-1", name: "rust" });
  });

  it("recovers from a concurrent-insert race (23505) by re-fetching the now-existing tag", async () => {
    // Two requests racing to create the same tag: this call's lookup finds nothing, but by the
    // time it inserts, the other request already created it — the unique index rejects the
    // insert, and getOrCreateTag should recover by re-fetching rather than failing the request.
    const builder = createQueuedBuilder();
    (builder.queue as (v: ResolvedValue) => void)({ data: [], error: null }); // lookup: none yet
    (builder.queue as (v: ResolvedValue) => void)({ data: null, error: { code: "23505" } }); // insert loses the race
    (builder.queue as (v: ResolvedValue) => void)({
      data: [{ id: "tag-3", name: "Rust" }],
      error: null,
    }); // re-fetch finds the winner's row

    const result = await getOrCreateTag(client(builder), "user-1", "rust");

    expect(result).toEqual({ id: "tag-3", name: "Rust" });
  });

  it("returns null and logs when the insert fails for a reason other than a race", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const builder = createQueuedBuilder();
    (builder.queue as (v: ResolvedValue) => void)({ data: [], error: null });
    (builder.queue as (v: ResolvedValue) => void)({ data: null, error: { message: "boom" } });

    const result = await getOrCreateTag(client(builder), "user-1", "rust");

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns null and logs when the initial lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const builder = createQueuedBuilder();
    (builder.queue as (v: ResolvedValue) => void)({ data: null, error: { message: "boom" } });

    const result = await getOrCreateTag(client(builder), "user-1", "rust");

    expect(result).toBeNull();
    expect(builder.insert).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
