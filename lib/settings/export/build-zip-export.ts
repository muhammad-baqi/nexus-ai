import JSZip from "jszip";

import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";
import type { ExportBundle } from "@/lib/settings/export/build-json-export";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Fresh, scoped query rather than an embedded dot-notation filter (matches app/api/items/route.ts's
// findDuplicateBookmark comment on why this codebase prefers computing an owned-id list first) —
// file_assets' own RLS (scoped via knowledge_items.owner_id) is still the real authorization
// boundary underneath regardless.
async function fetchOwnedFileAssets(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<{ storage_path: string; original_filename: string }[]> {
  const { data: fileItems, error: itemsError } = await supabase
    .from("knowledge_items")
    .select("id")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .in("type", ["pdf", "image", "file"]);
  if (itemsError) throw itemsError;

  const itemIds = (fileItems ?? []).map((item) => item.id);
  if (itemIds.length === 0) return [];

  const { data: assets, error: assetsError } = await supabase
    .from("file_assets")
    .select("storage_path, original_filename")
    .in("knowledge_item_id", itemIds);
  if (assetsError) throw assetsError;

  return assets ?? [];
}

// Settings.md: "a combined bundle including the JSON export plus any uploaded files/images/PDFs,
// for a complete offline copy." `export.json` at the root is exactly buildJsonExport's own output
// — the same bundle the 'json' format downloads standalone — plus each file's real bytes under
// files/.
export async function buildZipExport(
  supabase: SupabaseClient,
  ownerId: string,
  bundle: ExportBundle,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("export.json", JSON.stringify(bundle, null, 2));

  const assets = await fetchOwnedFileAssets(supabase, ownerId);
  const filesFolder = zip.folder("files");
  const usedNames = new Set<string>();

  for (const asset of assets) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(FILES_STORAGE_BUCKET)
      .download(asset.storage_path);

    if (downloadError || !blob) {
      // One missing/unreadable file shouldn't fail the whole export (CLAUDE.md rule 7) — the rest
      // of the bundle is still useful without it.
      console.error("[buildZipExport] downloading file asset failed:", asset.storage_path, downloadError);
      continue;
    }

    let name = asset.original_filename;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${suffix}-${asset.original_filename}`;
      suffix++;
    }
    usedNames.add(name);

    // Buffer.from(...), not the raw ArrayBuffer, matches lib/files/extract-pdf-text.ts's own
    // download-then-convert convention — also sidesteps a jsdom-vs-Node ArrayBuffer realm
    // mismatch this file's own test suite hit when passing a raw ArrayBuffer straight to JSZip.
    filesFolder!.file(name, Buffer.from(await blob.arrayBuffer()));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}
