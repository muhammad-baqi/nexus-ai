import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildMarkdownExport } from "@/lib/settings/export/build-markdown-export";
import type { ExportBundle } from "@/lib/settings/export/build-json-export";

import { runImportJob } from "./run-import-job";

const JOB_ID = "job-1";
const OWNER_ID = "owner-1";
const SOURCE_PATH = `${OWNER_ID}/imports/upload-1/source.json`;

function jsonBlob(value: unknown) {
  const text = JSON.stringify(value);
  return { text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

function textBlob(text: string) {
  return { text: () => Promise.resolve(text), arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

function bufferBlob(buffer: Buffer) {
  return { text: () => Promise.resolve(buffer.toString("utf-8")), arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)) };
}

let updateCalls: unknown[];
let inserted: Record<string, unknown[]>;
let downloadMock: ReturnType<typeof vi.fn>;

function createFakeSupabase(existingCollections: { name: string }[] = []) {
  let collectionCounter = 0;
  let itemCounter = 0;
  let tagCounter = 0;
  const tags: { id: string; name: string }[] = [];

  function table(name: string) {
    return {
      insert: (payload: Record<string, unknown>) => {
        inserted[name] = inserted[name] ?? [];
        inserted[name].push(payload);

        if (name === "collections") {
          const row = { id: `col-${++collectionCounter}`, ...payload };
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        }
        if (name === "knowledge_items") {
          const row = { id: `item-${++itemCounter}`, ...payload };
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        }
        if (name === "tags") {
          const row = { id: `tag-${++tagCounter}`, name: payload.name as string };
          tags.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) };
        }
        return Promise.resolve({ data: null, error: null });
      },
      select: () => {
        if (name === "tags") return { eq: () => Promise.resolve({ data: tags, error: null }) };
        if (name === "collections") {
          return { eq: () => ({ is: () => Promise.resolve({ data: existingCollections, error: null }) }) };
        }
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  }

  return {
    from: (name: string) => {
      if (name === "import_jobs") {
        return {
          update: (payload: unknown) => {
            updateCalls.push(payload);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      return table(name);
    },
    storage: { from: () => ({ download: downloadMock }) },
  };
}

const VALID_BUNDLE: ExportBundle = {
  exported_at: "2026-01-01T00:00:00.000Z",
  collections: [
    {
      name: "Inbox",
      description: null,
      color: null,
      icon: null,
      is_favorite: false,
      is_archived: false,
      items: [
        {
          type: "note",
          title: "My Note",
          description: null,
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
          tags: ["reading"],
          note: { content: "note body" },
        },
        {
          type: "code_snippet",
          title: "hello.ts",
          description: null,
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
          tags: [],
          code_snippet: { language: "typescript", code_content: "const x = 1;" },
        },
      ],
    },
  ],
};

describe("runImportJob — JSON", () => {
  beforeEach(() => {
    updateCalls = [];
    inserted = {};
  });

  it("creates new collections/items/tags from a valid bundle, created_count matches, skipped_count is 0", async () => {
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(VALID_BUNDLE), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH);

    expect(inserted.collections).toHaveLength(1);
    expect(inserted.knowledge_items).toHaveLength(2);
    expect(inserted.tags).toHaveLength(1);

    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "success", created_count: 2, skipped_count: 0 });
  });

  it("skips one deliberately malformed item while the other valid items in the same collection still get created", async () => {
    const bundleWithBadItem: ExportBundle = {
      exported_at: VALID_BUNDLE.exported_at,
      collections: [
        {
          ...VALID_BUNDLE.collections[0],
          items: [...VALID_BUNDLE.collections[0].items, { type: "not-a-real-type", title: "" } as never],
        },
      ],
    };
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(bundleWithBadItem), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH);

    expect(inserted.knowledge_items).toHaveLength(2);
    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "success", created_count: 2, skipped_count: 1 });
    expect((finalUpdate.skip_reasons as string[]).length).toBe(1);
  });

  it("disambiguates a collection name that collides with one the account already has (e.g. re-importing an export whose bundle includes \"Inbox\"), instead of dropping every item in it", async () => {
    // Regression test: every account has an "Inbox" collection from signup, and every export
    // includes it — before this fix, re-importing an account's own export would hit the
    // (owner_id, lower(name)) unique index on the very first collection and silently skip all
    // of its items.
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(VALID_BUNDLE), error: null });

    await runImportJob(
      createFakeSupabase([{ name: "Inbox" }]) as never,
      JOB_ID,
      OWNER_ID,
      "json",
      SOURCE_PATH,
    );

    expect(inserted.collections).toHaveLength(1);
    expect((inserted.collections[0] as { name: string }).name).not.toBe("Inbox");
    expect(inserted.knowledge_items).toHaveLength(2);
    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "success", created_count: 2, skipped_count: 0 });
  });

  it("resolves the job to status: 'failed', not a thrown exception, when the source isn't valid JSON", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    downloadMock = vi.fn().mockResolvedValue({ data: textBlob("not json{{{"), error: null });

    await expect(
      runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH),
    ).resolves.toBeUndefined();

    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "failed" });
    consoleError.mockRestore();
  });

  it("round-trips: buildJsonExport's own bundle shape imports to equivalent collection/item/tag counts", async () => {
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(VALID_BUNDLE), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH);

    expect(inserted.collections).toHaveLength(VALID_BUNDLE.collections.length);
    expect(inserted.knowledge_items).toHaveLength(VALID_BUNDLE.collections[0].items.length);
    expect(inserted.tags.map((t) => (t as { name: string }).name)).toEqual(["reading"]);
  });

  it("preserves created_at from the export rather than defaulting to import time", async () => {
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(VALID_BUNDLE), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH);

    const noteInsert = inserted.knowledge_items.find(
      (row) => (row as { title: string }).title === "My Note",
    ) as { created_at: string };
    expect(noteInsert.created_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects a website item with a non-http(s) URL (e.g. javascript:) as a skipped item, not created", async () => {
    const bundleWithBadUrl: ExportBundle = {
      exported_at: VALID_BUNDLE.exported_at,
      collections: [
        {
          name: "Inbox",
          description: null,
          color: null,
          icon: null,
          is_favorite: false,
          is_archived: false,
          items: [
            {
              type: "website",
              title: "Malicious",
              description: null,
              is_favorite: false,
              is_archived: false,
              created_at: "2026-01-01T00:00:00.000Z",
              tags: [],
              website: {
                url: "javascript:alert(1)",
                canonical_url: null,
                domain: null,
                og_image_url: null,
                favicon_url: null,
              },
            },
          ],
        },
      ],
    };
    downloadMock = vi.fn().mockResolvedValue({ data: jsonBlob(bundleWithBadUrl), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "json", SOURCE_PATH);

    expect(inserted.knowledge_items ?? []).toHaveLength(0);
    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "success", created_count: 0, skipped_count: 1 });
  });
});

describe("runImportJob — Markdown ZIP", () => {
  beforeEach(() => {
    updateCalls = [];
    inserted = {};
  });

  it("recreates items with correct type-specific data reconstructed from frontmatter", async () => {
    const zipBuffer = await buildMarkdownExport(VALID_BUNDLE);
    downloadMock = vi.fn().mockResolvedValue({ data: bufferBlob(zipBuffer), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "markdown", SOURCE_PATH);

    expect(inserted.knowledge_items).toHaveLength(2);
    expect(inserted.code_snippet_data).toEqual([
      { knowledge_item_id: "item-2", language: "typescript", code_content: "const x = 1;" },
    ]);

    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "success", created_count: 2 });
  });

  it("a tag name containing a comma survives Markdown-ZIP export -> import as one tag, not two", async () => {
    const bundleWithCommaTag: ExportBundle = {
      exported_at: VALID_BUNDLE.exported_at,
      collections: [
        {
          name: "Inbox",
          description: null,
          color: null,
          icon: null,
          is_favorite: false,
          is_archived: false,
          items: [
            {
              type: "note",
              title: "Tagged Note",
              description: null,
              is_favorite: false,
              is_archived: false,
              created_at: "2026-01-01T00:00:00.000Z",
              tags: ["a,b"],
              note: { content: "content" },
            },
          ],
        },
      ],
    };
    const zipBuffer = await buildMarkdownExport(bundleWithCommaTag);
    downloadMock = vi.fn().mockResolvedValue({ data: bufferBlob(zipBuffer), error: null });

    await runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "markdown", SOURCE_PATH);

    expect(inserted.tags.map((t) => (t as { name: string }).name)).toEqual(["a,b"]);
  });

  it("disambiguates a colliding collection name the same way the JSON path does", async () => {
    const zipBuffer = await buildMarkdownExport(VALID_BUNDLE);
    downloadMock = vi.fn().mockResolvedValue({ data: bufferBlob(zipBuffer), error: null });

    await runImportJob(
      createFakeSupabase([{ name: "Inbox" }]) as never,
      JOB_ID,
      OWNER_ID,
      "markdown",
      SOURCE_PATH,
    );

    expect(inserted.collections).toHaveLength(1);
    expect((inserted.collections[0] as { name: string }).name).not.toBe("Inbox");
    expect(inserted.knowledge_items).toHaveLength(2);
  });

  it("resolves the job to status: 'failed' when the source is corrupt/not a ZIP", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    downloadMock = vi.fn().mockResolvedValue({ data: textBlob("not a zip"), error: null });

    await expect(
      runImportJob(createFakeSupabase() as never, JOB_ID, OWNER_ID, "markdown", SOURCE_PATH),
    ).resolves.toBeUndefined();

    const finalUpdate = updateCalls[updateCalls.length - 1] as Record<string, unknown>;
    expect(finalUpdate).toMatchObject({ status: "failed" });
    consoleError.mockRestore();
  });
});
