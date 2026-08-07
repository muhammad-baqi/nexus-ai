import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
// fetchFileAsset (lib/items/file-asset.ts) calls signFileUrl to attach a fresh signed download
// URL — mocked as a black box (its own createSignedUrl-wrapping behavior is covered by
// lib/files/signed-url.test.ts), same reasoning fetchWebsiteMetadata's tests below don't need a
// Storage mock since it never touches Storage at all. vi.hoisted: referenced inside the
// vi.mock() factory below, which is itself hoisted above regular top-level declarations.
const { signFileUrl } = vi.hoisted(() => ({ signFileUrl: vi.fn() }));
vi.mock("@/lib/files/signed-url", () => ({ signFileUrl }));
const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";
const TARGET_COLLECTION_ID = "33333333-3333-3333-a333-333333333333";

type ResolvedValue = { data: unknown; error: unknown };

// A per-table FIFO queue: each test queues exactly the responses it expects the handler to
// consume, in the order the handler's own Supabase calls will consume them (e.g. a preliminary
// SELECT before the main UPDATE). This replaced a single shared query-builder/response pair that
// couldn't distinguish knowledge_items calls from note_versions calls, or a first call from a
// second call to the same table — needed once the PATCH handler started making more than one
// Supabase call per request.
let queues: Record<string, ResolvedValue[]>;
let fromCalls: Record<string, number>;
// Only populated for the tables tests actually inspect (reminders' deactivate/reactivate calls
// below) — every other call site here never asserted on `.update()`'s args before this feature.
let updateCalls: Record<string, unknown[][]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["select", "insert", "upsert", "eq", "is", "order", "limit"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.update = vi.fn((...args: unknown[]) => {
    (updateCalls[table] ??= []).push(args);
    return builder;
  });
  builder.single = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => {
    const queue = queues[table];
    resolve(queue && queue.length > 0 ? queue.shift()! : { data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      fromCalls[table] = (fromCalls[table] ?? 0) + 1;
      return createQueryBuilder(table);
    },
  }),
}));

import { DELETE, GET, PATCH } from "./route";

function requestFor(method: string, body?: unknown) {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("GET /api/items/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    signFileUrl.mockReset();
    queues = {};
    updateCalls = {};
    fromCalls = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await GET(requestFor("GET"), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item doesn't exist, isn't owned, or is trashed", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(404);
  });

  it("returns the item on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toEqual({
      id: VALID_ID,
      title: "Trip planning",
      description: "Packing list",
      tags: [],
    });
  });

  it("includes the item's currently-attached tags", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });
    queueResponse("knowledge_item_tags", {
      data: [{ tags: { id: "tag-2", name: "travel" } }, { tags: { id: "tag-1", name: "packing" } }],
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toMatchObject({
      tags: [
        { id: "tag-1", name: "packing" },
        { id: "tag-2", name: "travel" },
      ],
    });
  });

  it("returns tags: null (not []) when the tags read fails, so the caller can tell 'unconfirmed' from 'genuinely none'", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toMatchObject({ tags: null });
    consoleError.mockRestore();
  });

  it("records a view (item_views upsert) on a successful fetch", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(200);
    expect(fromCalls.item_views).toBe(1);
  });

  it("still returns the item when recording the view fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Packing list" },
      error: null,
    });
    queueResponse("item_views", { data: null, error: { message: "boom" } });

    const response = await GET(requestFor("GET"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: VALID_ID });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("embeds website_metadata for a website-type item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, type: "website", title: "https://example.com" },
      error: null,
    });
    queueResponse("website_metadata", {
      data: {
        url: "https://example.com",
        canonical_url: "https://example.com/",
        domain: "example.com",
        og_image_url: null,
        favicon_url: "https://example.com/favicon.ico",
        fetch_status: "success",
      },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toMatchObject({
      website_metadata: { domain: "example.com", fetch_status: "success" },
    });
  });

  it("does not query website_metadata for a note-type item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, type: "note", title: "Trip planning" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });
    const body = await response.json();

    expect(fromCalls.website_metadata).toBeUndefined();
    expect(body).not.toHaveProperty("website_metadata");
  });

  it.each(["pdf", "image", "file"])(
    "embeds file_asset (with a freshly-signed download_url) for a %s-type item",
    async (type) => {
      getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
      queueResponse("knowledge_items", { data: { id: VALID_ID, type, title: "report.pdf" }, error: null });
      queueResponse("file_assets", {
        data: {
          storage_path: "user-1/upload-id/report.pdf",
          original_filename: "report.pdf",
          mime_type: "application/pdf",
          size_bytes: 2048,
          extraction_status: "success",
        },
        error: null,
      });
      signFileUrl.mockResolvedValue("https://signed.example/download");

      const response = await GET(requestFor("GET"), { params });

      expect(await response.json()).toMatchObject({
        file_asset: {
          original_filename: "report.pdf",
          size_bytes: 2048,
          extraction_status: "success",
          download_url: "https://signed.example/download",
        },
      });
      expect(signFileUrl).toHaveBeenCalledWith(expect.anything(), "user-1/upload-id/report.pdf");
    },
  );

  it("does not query file_assets for a note-type item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, type: "note", title: "Trip planning" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });
    const body = await response.json();

    expect(fromCalls.file_assets).toBeUndefined();
    expect(body).not.toHaveProperty("file_asset");
  });

  it("embeds code_snippet_data for a code_snippet-type item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, type: "code_snippet", title: "Binary search" },
      error: null,
    });
    queueResponse("code_snippet_data", {
      data: { language: "python", code_content: "def search(): pass" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });

    expect(await response.json()).toMatchObject({
      code_snippet_data: { language: "python", code_content: "def search(): pass" },
    });
  });

  it("does not query code_snippet_data for a note-type item", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, type: "note", title: "Trip planning" },
      error: null,
    });

    const response = await GET(requestFor("GET"), { params });
    const body = await response.json();

    expect(fromCalls.code_snippet_data).toBeUndefined();
    expect(body).not.toHaveProperty("code_snippet_data");
  });
});

describe("PATCH /api/items/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    queues = {};
    fromCalls = {};
    updateCalls = {};
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), {
      params: invalidParams,
    });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a completely empty body", async () => {
    const response = await PATCH(requestFor("PATCH", {}), { params });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a body containing only openVersionId (no real field)", async () => {
    const response = await PATCH(requestFor("PATCH", { openVersionId: null }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a whitespace-only title", async () => {
    const response = await PATCH(requestFor("PATCH", { title: "   " }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the row doesn't exist / isn't owned", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(404);
  });

  it("updates and returns the item (title only — no description, no version bookkeeping) on success", async () => {
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", description: "Untouched" },
      error: null,
    });

    const response = await PATCH(requestFor("PATCH", { title: "Trip planning" }), { params });

    expect(await response.json()).toEqual({
      id: VALID_ID,
      title: "Trip planning",
      description: "Untouched",
      tags: [],
      versionId: null,
    });
    expect(fromCalls.note_versions).toBeUndefined();
  });

  it("accepts is_favorite/is_archived alone or together with other fields", async () => {
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", is_favorite: true, is_archived: false },
      error: null,
    });

    const response = await PATCH(requestFor("PATCH", { is_favorite: true }), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ is_favorite: true });

    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", is_favorite: true, is_archived: true },
      error: null,
    });

    const response2 = await PATCH(
      requestFor("PATCH", { title: "Trip planning", is_archived: true }),
      { params },
    );

    expect(response2.status).toBe(200);
    expect(await response2.json()).toMatchObject({ is_favorite: true, is_archived: true });
  });

  it("returns tags: null (not []) when the post-update tags read fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, title: "Trip planning", is_favorite: true },
      error: null,
    });
    queueResponse("knowledge_item_tags", { data: null, error: { message: "boom" } });

    const response = await PATCH(requestFor("PATCH", { is_favorite: true }), { params });

    expect(await response.json()).toMatchObject({ tags: null });
    consoleError.mockRestore();
  });

  it("returns 500 and logs on an update failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", { data: null, error: { message: "boom" } });

    const response = await PATCH(requestFor("PATCH", { title: "Trip" }), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  describe("move between collections (collection_id)", () => {
    it("verifies collection ownership before moving, and moves on success", async () => {
      queueResponse("collections", { data: { id: TARGET_COLLECTION_ID }, error: null });
      queueResponse("knowledge_items", {
        data: {
          id: VALID_ID,
          title: "Trip planning",
          collection_id: TARGET_COLLECTION_ID,
          is_favorite: true,
          is_archived: false,
        },
        error: null,
      });

      const response = await PATCH(requestFor("PATCH", { collection_id: TARGET_COLLECTION_ID }), {
        params,
      });

      expect(response.status).toBe(200);
      // Favorite/archived pass through untouched — moving never writes those columns.
      expect(await response.json()).toMatchObject({
        collection_id: TARGET_COLLECTION_ID,
        is_favorite: true,
        is_archived: false,
      });
      expect(fromCalls.note_versions).toBeUndefined();
    });

    it("returns 404 collection_not_found without touching knowledge_items when the target isn't owned/doesn't exist/is trashed", async () => {
      queueResponse("collections", { data: null, error: { code: "PGRST116" } });

      const response = await PATCH(requestFor("PATCH", { collection_id: TARGET_COLLECTION_ID }), {
        params,
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("collection_not_found");
      expect(fromCalls.knowledge_items).toBeUndefined();
    });
  });

  describe("version-history bookkeeping (description changes on a note)", () => {
    function queuePriorState(description: string, type = "note") {
      queueResponse("knowledge_items", { data: { description, type }, error: null });
    }

    function queueMainUpdate(description: string) {
      queueResponse("knowledge_items", {
        data: { id: VALID_ID, title: "Trip planning", description },
        error: null,
      });
    }

    it("openVersionId omitted inserts a new version row", async () => {
      queuePriorState("Old body");
      queueMainUpdate("New body");
      queueResponse("note_versions", { data: { id: "11111111-1111-1111-a111-111111111111" }, error: null });

      const response = await PATCH(
        requestFor("PATCH", { title: "Trip planning", description: "New body" }),
        { params },
      );

      expect(await response.json()).toMatchObject({ versionId: "11111111-1111-1111-a111-111111111111" });
    });

    it("openVersionId provided and matching an existing row updates it in place (coalesce)", async () => {
      queuePriorState("Old body");
      queueMainUpdate("Newer body");
      // The UPDATE-by-id attempt finds a match — no INSERT should ever be queued/needed.
      queueResponse("note_versions", { data: { id: "11111111-1111-1111-a111-111111111111" }, error: null });

      const response = await PATCH(
        requestFor("PATCH", {
          title: "Trip planning",
          description: "Newer body",
          openVersionId: "11111111-1111-1111-a111-111111111111",
        }),
        { params },
      );

      expect(await response.json()).toMatchObject({ versionId: "11111111-1111-1111-a111-111111111111" });
      expect(fromCalls.note_versions).toBe(1);
    });

    it("an openVersionId that doesn't match any row for this item falls back to inserting a new one", async () => {
      queuePriorState("Old body");
      queueMainUpdate("Newer body");
      queueResponse("note_versions", { data: null, error: null }); // UPDATE-by-id: no match
      queueResponse("note_versions", { data: { id: "version-2" }, error: null }); // fallback INSERT

      const response = await PATCH(
        requestFor("PATCH", {
          title: "Trip planning",
          description: "Newer body",
          openVersionId: "22222222-2222-2222-a222-222222222222",
        }),
        { params },
      );

      expect(await response.json()).toMatchObject({ versionId: "version-2" });
      expect(fromCalls.note_versions).toBe(2);
    });

    it("a PATCH whose description is unchanged from the stored value doesn't write a version", async () => {
      queuePriorState("Same body");
      queueMainUpdate("Same body");

      const response = await PATCH(
        requestFor("PATCH", { title: "Trip planning", description: "Same body" }),
        { params },
      );

      expect(await response.json()).toMatchObject({ versionId: null });
      expect(fromCalls.note_versions).toBeUndefined();
    });

    it("version-write logic is skipped for non-note item types", async () => {
      queuePriorState("Old body", "website");
      queueMainUpdate("New body");

      const response = await PATCH(
        requestFor("PATCH", { title: "Trip planning", description: "New body" }),
        { params },
      );

      expect(await response.json()).toMatchObject({ versionId: null });
      expect(fromCalls.note_versions).toBeUndefined();
    });

    it("a version-write failure still returns 200 with the updated item", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      queuePriorState("Old body");
      queueMainUpdate("New body");
      queueResponse("note_versions", { data: null, error: { message: "insert failed" } });

      const response = await PATCH(
        requestFor("PATCH", { title: "Trip planning", description: "New body" }),
        { params },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ versionId: null });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe("code_snippet_data updates (language/code_content)", () => {
    it("updates language/code_content on code_snippet_data for a language/code_content-only body, without an empty knowledge_items update", async () => {
      // Prior-state lookup (fires because language/code_content are present, same trigger as
      // "description") then the plain re-select in place of an UPDATE, since itemFields ends up
      // empty — an empty PostgREST PATCH body isn't safe to send.
      queueResponse("knowledge_items", { data: { description: null, type: "code_snippet" }, error: null });
      queueResponse("knowledge_items", { data: { id: VALID_ID, title: "Binary search" }, error: null });
      queueResponse("code_snippet_data", {
        data: { language: "python", code_content: "def search(): pass" },
        error: null,
      });

      const response = await PATCH(
        requestFor("PATCH", { language: "python", code_content: "def search(): pass" }),
        { params },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: VALID_ID,
        code_snippet_data: { language: "python", code_content: "def search(): pass" },
      });
      expect(fromCalls.knowledge_items).toBe(2);
    });

    it("returns 500 (not 200 with the edit silently dropped) when the code_snippet_data update itself fails", async () => {
      // Self-review catch: code_snippet_data IS the item's current content, unlike note_versions'
      // history bookkeeping — a failed write here must fail loudly, not return 200 with the
      // user's edited code gone and no error shown.
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      queueResponse("knowledge_items", { data: { description: null, type: "code_snippet" }, error: null });
      queueResponse("knowledge_items", { data: { id: VALID_ID, title: "Binary search" }, error: null });
      queueResponse("code_snippet_data", { data: null, error: { message: "boom" } });

      const response = await PATCH(
        requestFor("PATCH", { language: "python", code_content: "def search(): pass" }),
        { params },
      );

      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("is a no-op on code_snippet_data for a non-code_snippet item (doesn't error, doesn't write)", async () => {
      queueResponse("knowledge_items", { data: { description: null, type: "note" }, error: null });
      queueResponse("knowledge_items", { data: { id: VALID_ID, title: "Trip planning" }, error: null });

      const response = await PATCH(
        requestFor("PATCH", { language: "python", code_content: "def search(): pass" }),
        { params },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(fromCalls.code_snippet_data).toBeUndefined();
      expect(body).not.toHaveProperty("code_snippet_data");
    });
  });
});

describe("DELETE /api/items/:id", () => {
  beforeEach(() => {
    getUser.mockReset();
    queues = {};
    fromCalls = {};
    updateCalls = {};
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await DELETE(requestFor("DELETE"), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item is already trashed, isn't owned, or doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(404);
  });

  it("soft-deletes the item, scoped to the owner, and returns it", async () => {
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, deleted_at: "2026-08-03T00:00:00.000Z" },
      error: null,
    });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: VALID_ID });
  });

  it("deactivates the item's active reminders, marked deactivated_by_trash", async () => {
    queueResponse("knowledge_items", {
      data: { id: VALID_ID, deleted_at: "2026-08-03T00:00:00.000Z" },
      error: null,
    });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(200);
    expect(updateCalls.reminders).toHaveLength(1);
    expect(updateCalls.reminders[0][0]).toEqual({ is_active: false, deactivated_by_trash: true });
  });

  it("returns 500 and logs on a delete failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", { data: null, error: { message: "boom" } });

    const response = await DELETE(requestFor("DELETE"), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
