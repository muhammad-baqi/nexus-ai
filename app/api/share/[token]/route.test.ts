import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ResolvedValue = { data: unknown; error: unknown };

let tableQueues: Record<string, ResolvedValue[]>;
const createSignedUrl = vi.fn();

function nextTableResult(table: string): ResolvedValue {
  const queue = tableQueues[table];
  if (!queue || queue.length === 0) return { data: null, error: null };
  return queue.shift()!;
}

function createQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => builder);
  builder.single = vi.fn(() => builder);
  builder.then = (resolve: (value: ResolvedValue) => void) => resolve(nextTableResult(table));
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createQueryBuilder(table),
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

import { GET } from "./route";

function requestFor() {
  return new NextRequest("http://localhost:3000/api/share/some-token");
}

const params = Promise.resolve({ token: "some-token" });

describe("GET /api/share/:token", () => {
  beforeEach(() => {
    tableQueues = {};
    createSignedUrl.mockReset();
  });

  it("returns 404 for a token that doesn't match any active link", async () => {
    tableQueues.share_links = [{ data: null, error: null }];
    const response = await GET(requestFor(), { params });
    expect(response.status).toBe(404);
  });

  it("returns 404 (unavailable) for a trashed item behind an otherwise-valid link", async () => {
    tableQueues.share_links = [{ data: { knowledge_item_id: "item-1" }, error: null }];
    tableQueues.knowledge_items = [
      { data: { id: "item-1", title: "T", description: "D", type: "note", deleted_at: "2026-01-01T00:00:00.000Z" }, error: null },
    ];

    const response = await GET(requestFor(), { params });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.message).toBe("This item is no longer available.");
  });

  it("returns the read-only note representation for a valid link", async () => {
    tableQueues.share_links = [{ data: { knowledge_item_id: "item-1" }, error: null }];
    tableQueues.knowledge_items = [
      { data: { id: "item-1", title: "Trip", description: "# Plan", type: "note", deleted_at: null }, error: null },
    ];

    const response = await GET(requestFor(), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: "item-1", title: "Trip", description: "# Plan", type: "note" });
    expect(body.website_metadata).toBeUndefined();
  });

  it("includes a signed download URL for a file-type item", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/file" }, error: null });
    tableQueues.share_links = [{ data: { knowledge_item_id: "item-2" }, error: null }];
    tableQueues.knowledge_items = [
      { data: { id: "item-2", title: "Report", description: null, type: "pdf", deleted_at: null }, error: null },
    ];
    tableQueues.file_assets = [
      { data: { original_filename: "report.pdf", mime_type: "application/pdf", size_bytes: 1000, storage_path: "u/report.pdf" }, error: null },
    ];

    const response = await GET(requestFor(), { params });
    const body = await response.json();

    expect(body.file_asset).toMatchObject({ original_filename: "report.pdf", download_url: "https://signed.example/file" });
  });
});
