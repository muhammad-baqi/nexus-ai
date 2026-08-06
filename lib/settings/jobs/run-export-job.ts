import { buildJsonExport } from "@/lib/settings/export/build-json-export";
import { buildMarkdownExport } from "@/lib/settings/export/build-markdown-export";
import { buildZipExport } from "@/lib/settings/export/build-zip-export";
import { DATA_JOBS_STORAGE_BUCKET } from "@/lib/settings/constants";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
export type ExportFormat = "markdown" | "json" | "zip";

const CONTENT_TYPE: Record<ExportFormat, string> = {
  markdown: "application/zip",
  json: "application/json",
  zip: "application/zip",
};
const EXTENSION: Record<ExportFormat, string> = { markdown: "zip", json: "json", zip: "zip" };

// Runs via `after()` from POST /api/settings/export, after the enqueue response has already been
// sent (CLAUDE.md rule 5). Never throws — every failure path (a query error, a Storage upload
// failure) is caught and recorded on the job row as status 'failed' with a generic error_message
// (full detail via console.error, CLAUDE.md rule 4), same never-throw contract as
// lib/bookmarks/fetch-bookmark-metadata.ts, so the UI's poll loop always resolves instead of
// hanging on 'processing' forever.
export async function runExportJob(
  supabase: SupabaseClient,
  jobId: string,
  ownerId: string,
  format: ExportFormat,
): Promise<void> {
  const { error: startError } = await supabase
    .from("export_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);
  if (startError) console.error("[runExportJob] marking processing failed:", startError);

  try {
    const bundle = await buildJsonExport(supabase, ownerId);

    let body: Buffer | string;
    if (format === "json") {
      body = JSON.stringify(bundle, null, 2);
    } else if (format === "markdown") {
      body = await buildMarkdownExport(bundle);
    } else {
      body = await buildZipExport(supabase, ownerId, bundle);
    }

    const storagePath = `${ownerId}/exports/${jobId}.${EXTENSION[format]}`;
    const { error: uploadError } = await supabase.storage
      .from(DATA_JOBS_STORAGE_BUCKET)
      .upload(storagePath, body, { contentType: CONTENT_TYPE[format], upsert: true });
    if (uploadError) throw uploadError;

    const { error: doneError } = await supabase
      .from("export_jobs")
      .update({ status: "success", storage_path: storagePath, completed_at: new Date().toISOString() })
      .eq("id", jobId);
    if (doneError) console.error("[runExportJob] marking success failed:", doneError);
  } catch (error) {
    console.error("[runExportJob] export failed:", error);
    const { error: failError } = await supabase
      .from("export_jobs")
      .update({
        status: "failed",
        error_message: "Something went wrong generating your export.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (failError) console.error("[runExportJob] marking failed failed:", failError);
  }
}
