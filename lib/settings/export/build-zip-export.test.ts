import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import { buildZipExport } from "./build-zip-export";
import type { ExportBundle } from "./build-json-export";

type Resolved = { data: unknown; error: unknown };

function createQueryBuilder(resolved: Resolved) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: Resolved) => void) => resolve(resolved);
  return builder;
}

function blobOf(text: string) {
  return { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) };
}

const OWNER_ID = "owner-1";

const BUNDLE: ExportBundle = { exported_at: "2026-01-01T00:00:00.000Z", collections: [] };

const FILE_ITEMS = { data: [{ id: "item-1" }, { id: "item-2" }], error: null };
const FILE_ASSETS = {
  data: [
    { storage_path: "owner-1/a/report.pdf", original_filename: "report.pdf" },
    { storage_path: "owner-1/b/photo.png", original_filename: "photo.png" },
  ],
  error: null,
};

describe("buildZipExport", () => {
  it("export.json at the root matches buildJsonExport's own output", async () => {
    const download = vi.fn().mockResolvedValue({ data: blobOf("bytes"), error: null });
    const supabase = {
      from: (table: string) => createQueryBuilder(table === "knowledge_items" ? FILE_ITEMS : FILE_ASSETS),
      storage: { from: () => ({ download }) },
    };

    const zip = await JSZip.loadAsync(await buildZipExport(supabase as never, OWNER_ID, BUNDLE));
    const exportJson = await zip.file("export.json")!.async("string");

    expect(JSON.parse(exportJson)).toEqual(BUNDLE);
  });

  it("files/ contains the real bytes of every file_assets row for the account, correctly named", async () => {
    const download = vi.fn().mockImplementation((path: string) =>
      Promise.resolve({ data: blobOf(`bytes-for-${path}`), error: null }),
    );
    const supabase = {
      from: (table: string) => createQueryBuilder(table === "knowledge_items" ? FILE_ITEMS : FILE_ASSETS),
      storage: { from: () => ({ download }) },
    };

    const zip = await JSZip.loadAsync(await buildZipExport(supabase as never, OWNER_ID, BUNDLE));

    const pdfContent = await zip.file("files/report.pdf")!.async("string");
    expect(pdfContent).toBe("bytes-for-owner-1/a/report.pdf");
    const pngContent = await zip.file("files/photo.png")!.async("string");
    expect(pngContent).toBe("bytes-for-owner-1/b/photo.png");
  });

  it("a Storage download failure for one file skips just that file, not the whole export", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const download = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: "not found" } }))
      .mockImplementationOnce(() => Promise.resolve({ data: blobOf("photo bytes"), error: null }));
    const supabase = {
      from: (table: string) => createQueryBuilder(table === "knowledge_items" ? FILE_ITEMS : FILE_ASSETS),
      storage: { from: () => ({ download }) },
    };

    const zip = await JSZip.loadAsync(await buildZipExport(supabase as never, OWNER_ID, BUNDLE));

    expect(zip.file("files/report.pdf")).toBeNull();
    expect(await zip.file("files/photo.png")!.async("string")).toBe("photo bytes");
    consoleError.mockRestore();
  });
});
