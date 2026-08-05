import pdfParse from "pdf-parse";

import type { createClient } from "@/lib/supabase/server";
import { FILES_STORAGE_BUCKET } from "@/lib/files/constants";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Caps how much of a single PDF's text lands in search_vector/extracted_text — protects against
// a pathologically huge PDF bloating the DB row and the tsvector index; 200k chars is generous
// for anything a personal-knowledge-hub user is realistically saving.
const MAX_EXTRACTED_CHARS = 200_000;

// The background job itself (File_Uploads.md's Text extraction section) — downloads the just-
// uploaded PDF, extracts its text via pdf-parse (pure-JS, no native/canvas dependency, unlike
// pdfjs-dist directly), and records it for search indexing (007_file_uploads.sql folds
// file_assets.extracted_text into knowledge_items.search_vector). Called via `after()` from the
// create route, so it always runs after the response that created the item has already been sent
// (CLAUDE.md rule #5). Never throws: a scanned/image-only PDF with no embedded text layer, a
// corrupt/encrypted PDF, or a download/DB failure all land on `extraction_status: 'failed'`
// instead — the file stays saved and previewable either way, just not full-text searchable
// (CLAUDE.md rule #7 / File_Uploads.md's Error States).
export async function extractPdfText(
  supabase: SupabaseClient,
  itemId: string,
  storagePath: string,
): Promise<void> {
  try {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(FILES_STORAGE_BUCKET)
      .download(storagePath);

    if (downloadError || !blob) {
      console.error("[extractPdfText] download failed:", downloadError);
      await markExtractionFailed(supabase, itemId);
      return;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const result = await pdfParse(buffer);
    const text = result.text.trim();

    if (!text) {
      // No embedded text layer (e.g. a scanned/image-only PDF) — not an error, just nothing to
      // index. Still a "failed" extraction from the user's perspective (File_Uploads.md: "not
      // full-text searchable" is the state to show either way).
      await markExtractionFailed(supabase, itemId);
      return;
    }

    const capped = text.length > MAX_EXTRACTED_CHARS ? text.slice(0, MAX_EXTRACTED_CHARS) : text;

    const { error } = await supabase
      .from("file_assets")
      .update({ extracted_text: capped, extraction_status: "success" })
      .eq("knowledge_item_id", itemId);

    if (error) {
      console.error("[extractPdfText] file_assets update failed:", error);
    }
  } catch (error) {
    console.error("[extractPdfText] extraction failed:", error);
    await markExtractionFailed(supabase, itemId);
  }
}

async function markExtractionFailed(supabase: SupabaseClient, itemId: string): Promise<void> {
  const { error } = await supabase
    .from("file_assets")
    .update({ extraction_status: "failed" })
    .eq("knowledge_item_id", itemId);
  if (error) {
    console.error("[extractPdfText] marking extraction failed status failed:", error);
  }
}
