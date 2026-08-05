import { beforeEach, describe, expect, it, vi } from "vitest";

// safeFetch (lib/bookmarks/safe-fetch.ts) resolves any non-literal-IP hostname via DNS before
// fetching, as an SSRF guard — mocked here so these tests stay hermetic instead of depending on
// real DNS resolution for "example.com".
const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => {
  const lookup = (...args: unknown[]) => lookupMock(...args);
  return { lookup, default: { lookup } };
});

const { fetchBookmarkMetadata } = await import("./fetch-bookmark-metadata");

const ITEM_ID = "123e4567-e89b-12d3-a456-426614174000";
const URL_UNDER_TEST = "https://example.com/article";

type ResolvedValue = { data: unknown; error: unknown };

// Records every .update() call per table (in call order) so a test can assert both which
// table/payload was written and how many times — mirrors app/api/items/[id]/route.test.ts's
// per-table queue pattern, simplified since this function never .select()s, only .update()s.
let updateCalls: { table: string; payload: unknown }[];
let queuedError: Record<string, unknown>;

type FakeBuilder = { eq: () => FakeBuilder; then: (resolve: (value: ResolvedValue) => void) => void };

// `.eq()` is chainable (the title update chains two: `.eq("id", ...).eq("title", ...)`) and the
// builder itself resolves like a promise once awaited — matches supabase-js's real query builder
// shape, not just a single-call stub.
function createFakeSupabase() {
  return {
    from: (table: string) => ({
      update: (payload: unknown) => {
        updateCalls.push({ table, payload });
        const builder: FakeBuilder = {
          eq: () => builder,
          then: (resolve) => resolve({ data: null, error: queuedError[table] ?? null }),
        };
        return builder;
      },
    }),
  };
}

function mockFetchResponse(init: {
  ok?: boolean;
  contentType?: string | null;
  html?: string;
  finalUrl?: string;
}) {
  const { ok = true, contentType = "text/html; charset=utf-8", html = "", finalUrl = URL_UNDER_TEST } = init;
  return {
    ok,
    url: finalUrl,
    headers: { get: (name: string) => (name === "content-type" ? contentType : null) },
    text: () => Promise.resolve(html),
  };
}

describe("fetchBookmarkMetadata", () => {
  beforeEach(() => {
    updateCalls = [];
    queuedError = {};
    vi.stubGlobal("fetch", vi.fn());
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("on success, updates website_metadata and the item's title (still the placeholder URL)", async () => {
    const html = `<html><head><title>Real Title</title><meta property="og:image" content="/img.png"></head></html>`;
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ html }) as unknown as Response);

    await fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST);

    const metadataUpdate = updateCalls.find((c) => c.table === "website_metadata");
    expect(metadataUpdate?.payload).toMatchObject({
      domain: "example.com",
      og_image_url: "https://example.com/img.png",
      fetch_status: "success",
    });
    const titleUpdate = updateCalls.find((c) => c.table === "knowledge_items");
    expect(titleUpdate?.payload).toEqual({ title: "Real Title" });
  });

  it("does not overwrite the title when no title was extracted", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ html: "<html><head></head></html>" }) as unknown as Response);

    await fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST);

    expect(updateCalls.some((c) => c.table === "knowledge_items")).toBe(false);
  });

  it("marks fetch_status failed on a network error, without throwing", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unreachable"));

    await expect(
      fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST),
    ).resolves.toBeUndefined();

    expect(updateCalls).toEqual([
      { table: "website_metadata", payload: { fetch_status: "failed" } },
    ]);
  });

  it("marks fetch_status failed on a non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ ok: false }) as unknown as Response);

    await fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST);

    expect(updateCalls).toEqual([
      { table: "website_metadata", payload: { fetch_status: "failed" } },
    ]);
  });

  it("marks fetch_status failed on a non-HTML content type, without parsing the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ contentType: "application/pdf" }) as unknown as Response,
    );

    await fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST);

    expect(updateCalls).toEqual([
      { table: "website_metadata", payload: { fetch_status: "failed" } },
    ]);
  });

  it("marks fetch_status failed when the fetch is aborted (timeout)", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"));

    await fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST);

    expect(updateCalls).toEqual([
      { table: "website_metadata", payload: { fetch_status: "failed" } },
    ]);
  });

  it("never throws even when the DB update itself fails", async () => {
    queuedError.website_metadata = { message: "db down" };
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ html: "<html></html>" }) as unknown as Response);

    await expect(
      fetchBookmarkMetadata(createFakeSupabase() as never, ITEM_ID, URL_UNDER_TEST),
    ).resolves.toBeUndefined();
  });
});
