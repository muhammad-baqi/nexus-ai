import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
// vi.hoisted: these are referenced inside vi.mock() factories below, which are themselves
// hoisted above regular top-level const declarations — a plain `const after = ...` here would
// throw "Cannot access 'after' before initialization" once the hoisted mock factory runs first.
const { after, fetchBookmarkMetadata, extractPdfText, verifyUploadedFileContent, deleteUploadedObject } =
  vi.hoisted(() => ({
    fetchBookmarkMetadata: vi.fn(),
    extractPdfText: vi.fn(),
    verifyUploadedFileContent: vi.fn(),
    deleteUploadedObject: vi.fn(),
    // Invokes the deferred callback immediately (rather than actually deferring it) so a test can
    // assert on its effects synchronously — the real next/server after() only guarantees it runs
    // after the response is sent, which isn't itself something a unit test needs to model.
    after: vi.fn((callback: () => void) => callback()),
  }));
const VALID_COLLECTION_ID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_TAG_ID = "223e4567-e89b-12d3-a456-426614174000";

type ResolvedValue = { data: unknown; error: unknown };

interface QueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  resolveWith: (value: ResolvedValue) => QueryBuilder;
  then: (resolve: (value: ResolvedValue) => void) => void;
}

// A per-table FIFO queue: resolveWith() enqueues a response, each terminal await (via `then`)
// consumes the next one in order. A single resolveWith() call still works exactly as before for
// every existing single-call-per-table test; the queue only matters for the newer bookmark paths
// that call the same table (website_metadata) more than once per request (a duplicate-check
// SELECT, then an INSERT).
function createQueryBuilder(): QueryBuilder {
  const queue: ResolvedValue[] = [];
  const builder: QueryBuilder = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => builder),
    resolveWith: (value) => {
      queue.push(value);
      return builder;
    },
    then: (resolve) => resolve(queue.length > 0 ? queue.shift()! : { data: null, error: null }),
  };
  return builder;
}

let builders: Record<string, QueryBuilder>;
function getBuilder(table: string) {
  if (!builders[table]) builders[table] = createQueryBuilder();
  return builders[table];
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => getBuilder(table),
    rpc,
  }),
}));

vi.mock("@/lib/bookmarks/fetch-bookmark-metadata", () => ({ fetchBookmarkMetadata }));
vi.mock("@/lib/files/extract-pdf-text", () => ({ extractPdfText }));
// verify-upload.ts's own internals (content-sniffing against a fetched byte range) are covered
// by lib/files/verify-upload.test.ts — mocked here as a black box, same as
// fetchBookmarkMetadata above, so this file stays focused on the route's own dispatch/validation
// logic.
vi.mock("@/lib/files/verify-upload", () => ({ verifyUploadedFileContent, deleteUploadedObject }));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after };
});

import { GET, POST } from "./route";

function requestFor(query = "") {
  return new NextRequest(`http://localhost:3000/api/items${query}`);
}

function postRequestWith(body: unknown) {
  return new NextRequest("http://localhost:3000/api/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// The collection-ownership check every POST performs before inserting.
function allowCollectionOwnership() {
  getBuilder("collections").resolveWith({ data: { id: VALID_COLLECTION_ID }, error: null });
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    collection_id: VALID_COLLECTION_ID,
    type: "note",
    title: "Trip planning",
    is_favorite: false,
    is_archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    total_count: 1,
    ...overrides,
  };
}

describe("GET /api/items", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    builders = {};
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor());

    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed collection_id filter", async () => {
    const response = await GET(requestFor("?collection_id=not-a-uuid"));

    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid boolean filter value", async () => {
    const response = await GET(requestFor("?favorite=maybe"));

    expect(response.status).toBe(400);
  });

  it("scopes the search to the caller's own items via p_owner_id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor());

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_owner_id: "user-1" }),
    );
  });

  it("passes q, sort defaulting to relevance, and the collection_id filter through", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor(`?q=zephyrus&collection_id=${VALID_COLLECTION_ID}`));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({
        p_query: "zephyrus",
        p_collection_id: VALID_COLLECTION_ID,
        p_sort: "relevance",
      }),
    );
  });

  it("defaults sort to updated when there is no query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor());

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_query: null, p_sort: "updated" }),
    );
  });

  it("respects an explicit sort override even with a query present", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?q=zephyrus&sort=title"));

    expect(rpc).toHaveBeenCalledWith("search_knowledge_items", expect.objectContaining({ p_sort: "title" }));
  });

  it("collects repeated tag params into p_tag_ids (OR filter)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor(`?tag=${VALID_TAG_ID}&tag=${VALID_COLLECTION_ID}`));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_tag_ids: [VALID_TAG_ID, VALID_COLLECTION_ID] }),
    );
  });

  it("maps favorite=false to p_favorite: false, not undefined (the JS Boolean() coercion trap)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?favorite=false"));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_favorite: false }),
    );
  });

  it("extends created_to to the end of the selected day, not midnight (regression: a date-only value must include everything created that day)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?created_from=2026-08-01&created_to=2026-08-01"));

    const call = rpc.mock.calls[0][1] as { p_created_from: string; p_created_to: string };
    expect(call.p_created_from).toBe("2026-08-01T00:00:00.000Z");
    // An item created at 23:00 UTC on the selected end date must be <= this bound.
    expect(new Date("2026-08-01T23:00:00.000Z").getTime()).toBeLessThanOrEqual(
      new Date(call.p_created_to).getTime(),
    );
    expect(call.p_created_to.startsWith("2026-08-01")).toBe(true);
  });

  it("defaults page/limit and computes the offset for page 2", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    await GET(requestFor("?page=2&limit=5"));

    expect(rpc).toHaveBeenCalledWith(
      "search_knowledge_items",
      expect.objectContaining({ p_limit: 5, p_offset: 5 }),
    );
  });

  it("returns items with total/page/limit, stripping total_count off each row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [row({ total_count: 3 }), row({ id: "item-2", total_count: 3 })], error: null });

    const response = await GET(requestFor());
    const body = await response.json();

    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).not.toHaveProperty("total_count");
  });

  it("returns total: 0 for an empty result set", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await GET(requestFor());
    const body = await response.json();

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns 500 on a query failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(requestFor());

    expect(response.status).toBe(500);
  });
});

describe("POST /api/items — type dispatch", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 when type is missing, without touching the database", async () => {
    const response = await POST(postRequestWith({ collection_id: VALID_COLLECTION_ID }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported type value", async () => {
    const response = await POST(
      postRequestWith({ type: "code_snippet", collection_id: VALID_COLLECTION_ID }),
    );

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/items — notes", () => {
  beforeEach(() => {
    getUser.mockReset();
    builders = {};
  });

  it("returns 400 when collection_id is missing, without touching the database", async () => {
    const response = await POST(postRequestWith({ type: "note", title: "Trip" }));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      postRequestWith({ type: "note", collection_id: VALID_COLLECTION_ID }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the collection doesn't belong to the caller (or is trashed)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await POST(
      postRequestWith({ type: "note", collection_id: VALID_COLLECTION_ID }),
    );

    expect(response.status).toBe(404);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("defaults the title to 'Untitled Note' when omitted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", title: "Untitled Note" },
      error: null,
    });

    await POST(postRequestWith({ type: "note", collection_id: VALID_COLLECTION_ID }));

    expect(getBuilder("knowledge_items").insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Untitled Note" }),
    );
  });

  it("creates a note and returns it with 201", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", title: "Trip planning", description: "Packing list" },
      error: null,
    });

    const response = await POST(
      postRequestWith({
        type: "note",
        collection_id: VALID_COLLECTION_ID,
        title: "Trip planning",
        description: "Packing list",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "item-1",
      title: "Trip planning",
      description: "Packing list",
    });
  });

  it("returns 500 and logs on an insert failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(
      postRequestWith({ type: "note", collection_id: VALID_COLLECTION_ID }),
    );

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("POST /api/items — website bookmarks", () => {
  const URL_UNDER_TEST = "https://example.com/article";

  function bookmarkBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      type: "website",
      collection_id: VALID_COLLECTION_ID,
      url: URL_UNDER_TEST,
      ...overrides,
    };
  }

  // The duplicate check every bookmark POST performs before inserting.
  function allowNoDuplicates() {
    getBuilder("website_metadata").resolveWith({ data: [], error: null });
  }

  beforeEach(() => {
    getUser.mockReset();
    builders = {};
    fetchBookmarkMetadata.mockReset();
    after.mockClear();
  });

  it("returns 400 for an invalid URL format, without touching the database", async () => {
    const response = await POST(postRequestWith(bookmarkBody({ url: "not a url" })));

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-http(s) URL scheme", async () => {
    const response = await POST(
      postRequestWith(bookmarkBody({ url: "javascript:alert(1)" })),
    );

    expect(response.status).toBe(400);
  });

  it("creates the bookmark immediately with fetch_status pending and the raw URL as title, enqueuing the metadata job via after() rather than awaiting it inline", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    allowNoDuplicates();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", type: "website", title: URL_UNDER_TEST },
      error: null,
    });
    getBuilder("website_metadata").resolveWith({ data: null, error: null }); // the metadata insert

    const response = await POST(postRequestWith(bookmarkBody()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "item-1", type: "website", title: URL_UNDER_TEST });
    expect(getBuilder("knowledge_items").insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "website", title: URL_UNDER_TEST }),
    );
    expect(getBuilder("website_metadata").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge_item_id: "item-1",
        url: URL_UNDER_TEST,
        fetch_status: "pending",
      }),
    );
    expect(after).toHaveBeenCalledWith(expect.any(Function));
    expect(fetchBookmarkMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "item-1",
      URL_UNDER_TEST,
    );
  });

  it("returns the non-blocking duplicate signal instead of creating, when the URL matches an existing non-trashed bookmark", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("website_metadata").resolveWith({
      data: [
        {
          knowledge_item_id: "existing-1",
          url: URL_UNDER_TEST,
          canonical_url: null,
          knowledge_items: { deleted_at: null },
        },
      ],
      error: null,
    });

    // Tracking-param variant of the same already-saved URL.
    const response = await POST(
      postRequestWith(bookmarkBody({ url: `${URL_UNDER_TEST}?utm_source=newsletter` })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ duplicate: true, existingItemId: "existing-1" });
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("creates the bookmark anyway when confirmDuplicate is true, despite a match", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-2", type: "website", title: URL_UNDER_TEST },
      error: null,
    });
    getBuilder("website_metadata").resolveWith({ data: null, error: null });

    const response = await POST(postRequestWith(bookmarkBody({ confirmDuplicate: true })));

    expect(response.status).toBe(201);
    expect(getBuilder("knowledge_items").insert).toHaveBeenCalled();
    // The duplicate-check SELECT itself is skipped entirely when confirming — nothing else was
    // queued against website_metadata besides the metadata insert this call consumes.
    expect(getBuilder("website_metadata").select).not.toHaveBeenCalled();
  });

  it("does not flag a match against a trashed bookmark", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("website_metadata").resolveWith({
      data: [
        {
          knowledge_item_id: "trashed-1",
          url: URL_UNDER_TEST,
          canonical_url: null,
          knowledge_items: { deleted_at: "2026-01-01T00:00:00.000Z" },
        },
      ],
      error: null,
    });
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-3", type: "website", title: URL_UNDER_TEST },
      error: null,
    });
    getBuilder("website_metadata").resolveWith({ data: null, error: null }); // the metadata insert

    const response = await POST(postRequestWith(bookmarkBody()));

    expect(response.status).toBe(201);
    expect(getBuilder("knowledge_items").insert).toHaveBeenCalled();
  });

  it("returns 500 and logs when the item insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    allowNoDuplicates();
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(postRequestWith(bookmarkBody()));

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still returns 201 when the website_metadata insert fails, but does not enqueue the background job", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    allowNoDuplicates();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-4", type: "website", title: URL_UNDER_TEST },
      error: null,
    });
    getBuilder("website_metadata").resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(postRequestWith(bookmarkBody()));

    expect(response.status).toBe(201);
    expect(after).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("POST /api/items — file uploads (pdf/image/file)", () => {
  const STORAGE_PATH = "user-1/upload-id/report.pdf";

  function fileBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      type: "pdf",
      collection_id: VALID_COLLECTION_ID,
      storage_path: STORAGE_PATH,
      filename: "report.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      ...overrides,
    };
  }

  beforeEach(() => {
    getUser.mockReset();
    builders = {};
    extractPdfText.mockReset();
    verifyUploadedFileContent.mockReset();
    deleteUploadedObject.mockReset();
    after.mockClear();
    verifyUploadedFileContent.mockResolvedValue({ ok: true, actualSizeBytes: null });
  });

  it("returns 400 and cleans up the uploaded object when the declared mime_type/size don't pass validateFileUpload", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await POST(
      postRequestWith(fileBody({ size_bytes: 51 * 1024 * 1024 })), // over the 50MB PDF cap
    );

    expect(response.status).toBe(400);
    // Cleanup happens here (not skipped) — self-review caught an earlier ordering where this
    // check ran before the storage_path/auth checks that make cleanup possible at all, leaving a
    // rejected upload's bytes orphaned in Storage.
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("returns 400 when the declared type doesn't match the declared mime_type's real category", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await POST(
      postRequestWith(fileBody({ type: "image", mime_type: "application/pdf" })),
    );

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(postRequestWith(fileBody()));

    expect(response.status).toBe(401);
  });

  it("returns 400 and does not touch Storage/DB when storage_path isn't under the caller's own owner-id prefix", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const response = await POST(
      postRequestWith(fileBody({ storage_path: "someone-else/upload-id/report.pdf" })),
    );

    expect(response.status).toBe(400);
    expect(verifyUploadedFileContent).not.toHaveBeenCalled();
  });

  it("returns 404 and cleans up the uploaded object when the collection doesn't belong to the caller", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBuilder("collections").resolveWith({ data: null, error: { code: "PGRST116" } });

    const response = await POST(postRequestWith(fileBody()));

    expect(response.status).toBe(404);
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("returns 400 and cleans up the uploaded object when content-sniffing finds a mismatch", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    verifyUploadedFileContent.mockResolvedValue({ ok: false, reason: "content mismatch" });

    const response = await POST(postRequestWith(fileBody()));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("content mismatch");
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("returns 400 and cleans up when Storage's own reported size exceeds the cap, even though the client declared a smaller size", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    // Client claims 1KB (fileBody()'s default), but the Range-fetch response Storage actually
    // returned reports the real object as over the 50MB PDF cap — a client could otherwise lie
    // about size_bytes in the POST body to slide under a cap.
    verifyUploadedFileContent.mockResolvedValue({ ok: true, actualSizeBytes: 51 * 1024 * 1024 });

    const response = await POST(postRequestWith(fileBody()));

    expect(response.status).toBe(400);
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    expect(getBuilder("knowledge_items").insert).not.toHaveBeenCalled();
  });

  it("stores Storage's authoritative reported size, not the client-declared one, when they differ", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    verifyUploadedFileContent.mockResolvedValue({ ok: true, actualSizeBytes: 5000 });
    getBuilder("knowledge_items").resolveWith({ data: { id: "item-1", type: "pdf" }, error: null });
    getBuilder("file_assets").resolveWith({ data: null, error: null });

    await POST(postRequestWith(fileBody({ size_bytes: 1024 })));

    expect(getBuilder("file_assets").insert).toHaveBeenCalledWith(
      expect.objectContaining({ size_bytes: 5000 }),
    );
  });

  it("falls back to the client-declared size when Storage's Range response doesn't report one", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    verifyUploadedFileContent.mockResolvedValue({ ok: true, actualSizeBytes: null });
    getBuilder("knowledge_items").resolveWith({ data: { id: "item-1", type: "pdf" }, error: null });
    getBuilder("file_assets").resolveWith({ data: null, error: null });

    await POST(postRequestWith(fileBody({ size_bytes: 1024 })));

    expect(getBuilder("file_assets").insert).toHaveBeenCalledWith(
      expect.objectContaining({ size_bytes: 1024 }),
    );
  });

  it("creates the item + file_assets row, titled from the filename, and enqueues PDF extraction via after()", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-1", type: "pdf", title: "report.pdf" },
      error: null,
    });
    getBuilder("file_assets").resolveWith({ data: null, error: null });

    const response = await POST(postRequestWith(fileBody()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "item-1", type: "pdf", title: "report.pdf" });
    expect(getBuilder("knowledge_items").insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pdf", title: "report.pdf" }),
    );
    expect(getBuilder("file_assets").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge_item_id: "item-1",
        storage_path: STORAGE_PATH,
        original_filename: "report.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        extraction_status: "pending",
      }),
    );
    expect(after).toHaveBeenCalledWith(expect.any(Function));
    expect(extractPdfText).toHaveBeenCalledWith(expect.anything(), "item-1", STORAGE_PATH);
  });

  it("does not enqueue extraction for image/file items", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-2", type: "image", title: "photo.png" },
      error: null,
    });
    getBuilder("file_assets").resolveWith({ data: null, error: null });

    const response = await POST(
      postRequestWith(
        fileBody({ type: "image", mime_type: "image/png", filename: "photo.png", storage_path: "user-1/id/photo.png" }),
      ),
    );

    expect(response.status).toBe(201);
    expect(getBuilder("file_assets").insert).toHaveBeenCalledWith(
      expect.objectContaining({ extraction_status: "not_applicable" }),
    );
    expect(after).not.toHaveBeenCalled();
    expect(extractPdfText).not.toHaveBeenCalled();
  });

  it("rolls back the item and cleans up Storage when the file_assets insert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({
      data: { id: "item-3", type: "pdf", title: "report.pdf" },
      error: null,
    });
    getBuilder("file_assets").resolveWith({ data: null, error: { message: "boom" } });
    getBuilder("knowledge_items").resolveWith({ data: null, error: null }); // the rollback delete

    const response = await POST(postRequestWith(fileBody()));

    expect(response.status).toBe(500);
    expect(getBuilder("knowledge_items").delete).toHaveBeenCalled();
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    expect(after).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 and cleans up Storage when the item insert itself fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    allowCollectionOwnership();
    getBuilder("knowledge_items").resolveWith({ data: null, error: { message: "boom" } });

    const response = await POST(postRequestWith(fileBody()));

    expect(response.status).toBe(500);
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
    consoleError.mockRestore();
  });
});
