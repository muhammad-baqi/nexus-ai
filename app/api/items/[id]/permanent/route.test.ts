import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
// deleteUploadedObject's own Storage-removal behavior is covered by
// lib/files/verify-upload.test.ts — mocked here as a black box, same reasoning the route tests
// elsewhere in this repo mock fetchBookmarkMetadata/extractPdfText rather than re-testing them.
// vi.hoisted: referenced inside the vi.mock() factory below, which is itself hoisted above
// regular top-level declarations.
const { deleteUploadedObject } = vi.hoisted(() => ({ deleteUploadedObject: vi.fn() }));
vi.mock("@/lib/files/verify-upload", () => ({ deleteUploadedObject }));

const VALID_ID = "123e4567-e89b-12d3-a456-426614174000";
const STORAGE_PATH = "user-1/upload-id/report.pdf";

type ResolvedValue = { data: unknown; error: unknown };

// Per-table FIFO queue — this route now makes two distinct Supabase calls per request (a
// file_assets lookup via maybeSingle(), then the knowledge_items delete via single()), so a
// single shared resolvedValue can no longer tell them apart.
let queues: Record<string, ResolvedValue[]>;

function queueResponse(table: string, value: ResolvedValue) {
  (queues[table] ??= []).push(value);
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chainable = ["delete", "eq", "not", "select"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  const resolve = () => {
    const queue = queues[table];
    return queue && queue.length > 0 ? queue.shift()! : { data: null, error: null };
  };
  builder.single = vi.fn(resolve);
  builder.maybeSingle = vi.fn(resolve);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => createQueryBuilder(table),
  }),
}));

import { DELETE } from "./route";

function requestFor() {
  return new NextRequest(`http://localhost:3000/api/items/${VALID_ID}/permanent`, {
    method: "DELETE",
  });
}

const params = Promise.resolve({ id: VALID_ID });
const invalidParams = Promise.resolve({ id: "not-a-uuid" });

describe("DELETE /api/items/:id/permanent", () => {
  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    deleteUploadedObject.mockReset();
    queues = {};
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await DELETE(requestFor(), { params: invalidParams });

    expect(response.status).toBe(400);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the item isn't currently trashed, isn't owned, or doesn't exist", async () => {
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("This item isn't in Trash.");
  });

  it("hard-deletes a note (no file_assets row) and returns its id, without touching Storage", async () => {
    queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: VALID_ID, deleted: true });
    expect(deleteUploadedObject).not.toHaveBeenCalled();
  });

  it("returns 500 and logs on a delete failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queueResponse("knowledge_items", { data: null, error: { message: "boom" } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("removes the underlying Storage object for a pdf/image/file item, after the DB row is confirmed gone", async () => {
    queueResponse("file_assets", { data: { storage_path: STORAGE_PATH }, error: null });
    queueResponse("knowledge_items", { data: { id: VALID_ID }, error: null });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(200);
    expect(deleteUploadedObject).toHaveBeenCalledWith(expect.anything(), STORAGE_PATH);
  });

  it("does not attempt Storage cleanup when the delete itself fails, even for a file item", async () => {
    queueResponse("file_assets", { data: { storage_path: STORAGE_PATH }, error: null });
    queueResponse("knowledge_items", { data: null, error: { code: "PGRST116" } });

    const response = await DELETE(requestFor(), { params });

    expect(response.status).toBe(404);
    expect(deleteUploadedObject).not.toHaveBeenCalled();
  });
});
