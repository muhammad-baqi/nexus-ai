import { signFileUrl } from "@/lib/files/signed-url";
import type { createClient } from "@/lib/supabase/server";

export type FileAsset = {
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  extraction_status: "not_applicable" | "pending" | "success" | "failed";
  download_url: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Mirrors lib/items/website-metadata.ts's fetchWebsiteMetadata shape/error-handling — used by
// GET /api/items/:id to embed a pdf/image/file item's metadata plus a freshly-signed, short-lived
// download/preview URL (files stay private-by-default in Storage, never a stored/public URL).
// `null` return means the read itself failed (logged); the caller decides how to degrade.
export async function fetchFileAsset(supabase: SupabaseClient, itemId: string): Promise<FileAsset | null> {
  const { data, error } = await supabase
    .from("file_assets")
    .select("storage_path, original_filename, mime_type, size_bytes, extraction_status")
    .eq("knowledge_item_id", itemId)
    .maybeSingle();

  if (error) {
    console.error("[lib/items/file-asset] fetchFileAsset failed:", error);
    return null;
  }

  if (!data) return null;

  const download_url = await signFileUrl(supabase, data.storage_path);

  return {
    original_filename: data.original_filename,
    mime_type: data.mime_type,
    size_bytes: data.size_bytes,
    extraction_status: data.extraction_status,
    download_url,
  };
}
