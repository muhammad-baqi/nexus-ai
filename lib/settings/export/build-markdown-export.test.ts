import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildMarkdownExport } from "./build-markdown-export";
import type { ExportBundle } from "./build-json-export";

function bundleWith(collections: ExportBundle["collections"]): ExportBundle {
  return { exported_at: "2026-01-01T00:00:00.000Z", collections };
}

describe("buildMarkdownExport", () => {
  it("produces one folder per collection, sanitizing/deduping folder names", async () => {
    const noteItem = (title: string) => ({
      type: "note" as const,
      title,
      description: null,
      is_favorite: false,
      is_archived: false,
      created_at: "2026-01-01T00:00:00.000Z",
      tags: [],
      note: { content: "content" },
    });
    const bundle = bundleWith([
      { name: "Inbox", description: null, color: null, icon: null, is_favorite: false, is_archived: false, items: [noteItem("a")] },
      { name: "A/B: Notes", description: null, color: null, icon: null, is_favorite: false, is_archived: false, items: [noteItem("b")] },
      { name: "Inbox", description: null, color: null, icon: null, is_favorite: false, is_archived: false, items: [noteItem("c")] },
    ]);

    const zip = await JSZip.loadAsync(await buildMarkdownExport(bundle));
    const folders = new Set(Object.keys(zip.files).map((path) => path.split("/")[0]));

    expect(folders).toContain("Inbox");
    expect(folders).toContain("Inbox-2");
    expect([...folders].some((name) => name.includes("A_B_ Notes"))).toBe(true);
  });

  it("a note's .md file body is its real content; a non-note item's .md body is the metadata frontmatter block instead", async () => {
    const bundle = bundleWith([
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
            tags: [],
            note: { content: "# Real note content" },
          },
          {
            type: "website",
            title: "Example Bookmark",
            description: null,
            is_favorite: false,
            is_archived: false,
            created_at: "2026-01-01T00:00:00.000Z",
            tags: [],
            website: {
              url: "https://example.com",
              canonical_url: null,
              domain: "example.com",
              og_image_url: null,
              favicon_url: null,
            },
          },
        ],
      },
    ]);

    const zip = await JSZip.loadAsync(await buildMarkdownExport(bundle));

    const noteFile = await zip.file("Inbox/My Note.md")!.async("string");
    expect(noteFile).toContain("# Real note content");

    const websiteFile = await zip.file("Inbox/Example Bookmark.md")!.async("string");
    expect(websiteFile).toContain("url: https://example.com");
    expect(websiteFile).toContain("type: website");
  });

  it("two items with the same title in one collection get distinct, non-colliding filenames", async () => {
    const item = (overrides: Partial<ExportBundle["collections"][number]["items"][number]> = {}) => ({
      type: "note" as const,
      title: "Duplicate",
      description: null,
      is_favorite: false,
      is_archived: false,
      created_at: "2026-01-01T00:00:00.000Z",
      tags: [],
      note: { content: "content" },
      ...overrides,
    });

    const bundle = bundleWith([
      {
        name: "Inbox",
        description: null,
        color: null,
        icon: null,
        is_favorite: false,
        is_archived: false,
        items: [item(), item()],
      },
    ]);

    const zip = await JSZip.loadAsync(await buildMarkdownExport(bundle));
    const fileNames = Object.keys(zip.files).filter((path) => path.startsWith("Inbox/"));

    expect(fileNames).toContain("Inbox/Duplicate.md");
    expect(fileNames).toContain("Inbox/Duplicate-2.md");
  });
});
