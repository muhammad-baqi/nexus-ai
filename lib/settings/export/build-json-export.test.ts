import { describe, expect, it } from "vitest";

import { buildJsonExport } from "./build-json-export";

type Resolved = { data: unknown; error: unknown };

function createQueryBuilder(resolved: Resolved, calls: unknown[][]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Resolved) => void) => resolve(resolved);
  return builder;
}

function createFakeSupabase(tables: Record<string, Resolved>) {
  const calls: Record<string, unknown[][]> = {};
  const supabase = {
    from: (table: string) => {
      calls[table] = calls[table] ?? [];
      return createQueryBuilder(tables[table] ?? { data: [], error: null }, calls[table]);
    },
  };
  return { supabase, calls };
}

const OWNER_ID = "owner-1";

function baseFixtures(overrides: Partial<Record<string, Resolved>> = {}): Record<string, Resolved> {
  return {
    collections: {
      data: [
        {
          id: "col-1",
          name: "Inbox",
          description: null,
          color: null,
          icon: null,
          is_favorite: false,
          is_archived: false,
        },
      ],
      error: null,
    },
    knowledge_items: {
      data: [
        {
          id: "item-note",
          collection_id: "col-1",
          type: "note",
          title: "My Note",
          description: "Note body text",
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "item-website",
          collection_id: "col-1",
          type: "website",
          title: "Example",
          description: null,
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "item-file",
          collection_id: "col-1",
          type: "pdf",
          title: "report.pdf",
          description: null,
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "item-snippet",
          collection_id: "col-1",
          type: "code_snippet",
          title: "hello.ts",
          description: null,
          is_favorite: false,
          is_archived: false,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      error: null,
    },
    knowledge_item_tags: {
      data: [{ knowledge_item_id: "item-website", tags: { name: "reading" } }],
      error: null,
    },
    website_metadata: {
      data: [
        {
          knowledge_item_id: "item-website",
          url: "https://example.com",
          canonical_url: null,
          domain: "example.com",
          og_image_url: null,
          favicon_url: null,
        },
      ],
      error: null,
    },
    file_assets: {
      data: [
        { knowledge_item_id: "item-file", original_filename: "report.pdf", mime_type: "application/pdf", size_bytes: 1024 },
      ],
      error: null,
    },
    code_snippet_data: {
      data: [{ knowledge_item_id: "item-snippet", language: "typescript", code_content: "const x = 1;" }],
      error: null,
    },
    ...overrides,
  };
}

describe("buildJsonExport", () => {
  it("excludes trashed collections and trashed items", async () => {
    const { supabase, calls } = createFakeSupabase(baseFixtures());

    await buildJsonExport(supabase as never, OWNER_ID);

    expect(calls.collections).toContainEqual(["is", "deleted_at", null]);
    expect(calls.knowledge_items).toContainEqual(["is", "deleted_at", null]);
  });

  it("a note item's note.content matches knowledge_items.description", async () => {
    const { supabase } = createFakeSupabase(baseFixtures());

    const bundle = await buildJsonExport(supabase as never, OWNER_ID);

    const noteItem = bundle.collections[0].items.find((item) => item.type === "note");
    expect(noteItem?.note).toEqual({ content: "Note body text" });
  });

  it("a website/file/code_snippet item embeds its own type-specific data, tags included", async () => {
    const { supabase } = createFakeSupabase(baseFixtures());

    const bundle = await buildJsonExport(supabase as never, OWNER_ID);
    const items = bundle.collections[0].items;

    const websiteItem = items.find((item) => item.type === "website");
    expect(websiteItem?.website).toEqual({
      url: "https://example.com",
      canonical_url: null,
      domain: "example.com",
      og_image_url: null,
      favicon_url: null,
    });
    expect(websiteItem?.tags).toEqual(["reading"]);

    const fileItem = items.find((item) => item.type === "pdf");
    expect(fileItem?.file).toEqual({
      original_filename: "report.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
    });

    const snippetItem = items.find((item) => item.type === "code_snippet");
    expect(snippetItem?.code_snippet).toEqual({ language: "typescript", code_content: "const x = 1;" });
  });

  it("an item with no tags gets tags: [], not a missing/undefined field", async () => {
    const { supabase } = createFakeSupabase(baseFixtures({ knowledge_item_tags: { data: [], error: null } }));

    const bundle = await buildJsonExport(supabase as never, OWNER_ID);

    for (const item of bundle.collections[0].items) {
      expect(item.tags).toEqual([]);
    }
  });
});
